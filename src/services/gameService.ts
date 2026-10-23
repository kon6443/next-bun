import fetchServiceInstance from './FetchService';
import { ApiError, type ApiErrorResponse, type ApiResponse, createApiError } from '@/types/api';
import type {
  GameBoard,
  GameMode,
  GameSession,
  GameType,
  RankingList,
  RankingPeriod,
  ReplayDataByGame,
  ReplayPayloadByGame,
  ScoreDetailByGame,
  SubmitScoreRequest,
  SubmitScoreResponse,
} from '@/types/game';

// ==================== 공통 에러 처리 ====================

type ErrorMessageMap = {
  404?: string;
  409?: string;
  413?: string;
  422?: string;
  429?: string;
  503?: string;
  default: string;
};

/**
 * API 응답 에러를 ApiError로 던진다 (teamService.ts의 handleApiError와 같은 규칙)
 * 백엔드 code가 있으면 그 code로, 없으면 상태 코드 기반 code와 폴백 메시지로 던진다
 */
async function handleApiError(response: Response, errorMessages: ErrorMessageMap): Promise<never> {
  let errorData: ApiErrorResponse | null = null;

  try {
    const text = await response.text();
    if (text) {
      errorData = JSON.parse(text) as ApiErrorResponse;
    }
  } catch {
    // 본문 읽기·JSON 파싱 실패 — 상태 코드 기반으로 던진다
  }

  if (errorData?.code) {
    throw createApiError(errorData, response.status);
  }

  const defaultCodeMap: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    413: 'PAYLOAD_TOO_LARGE',
    422: 'VALIDATION_ERROR',
    429: 'TOO_MANY_REQUESTS',
    500: 'INTERNAL_SERVER_ERROR',
    503: 'SERVICE_UNAVAILABLE',
  };

  throw new ApiError(
    defaultCodeMap[response.status] || 'UNKNOWN_ERROR',
    errorData?.message || errorMessages[response.status as keyof ErrorMessageMap] || errorMessages.default,
    response.status,
  );
}

const TOO_MANY = '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.';

/** 백엔드 short 스로틀 창(1000ms) + 경계 오차 여유 */
const RETRY_AFTER_UNAUTHORIZED_MS = 1100;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 응답 대기 상한 — 망이 멈추면 "준비 중"·"등록 중"·로딩에 영원히 머물지 않고 기존 실패·재시도 분기로 간다(FE-08)
 * 제출은 서버 검증이 오래 걸릴 수 있어 넉넉히. 시간이 지나면 TimeoutError → NetworkError(다시 시도 대상)
 */
export const SESSION_TIMEOUT_MS = 10_000;
export const SUBMIT_TIMEOUT_MS = 30_000;
export const REPLAY_TIMEOUT_MS = 15_000;

/** AbortSignal.timeout이 없는 오래된 브라우저에서는 상한 없이 */
function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
}

/**
 * 선택 인증 호출 — 만료·잘못된 토큰은 백엔드가 401로 막으므로(토큰이 없어야 비로그인 통과) 토큰 없이 1회 재시도한다
 * 제출도 가드가 먼저 막아 세션이 소모되지 않으니 재시도해도 안전하다
 */
async function fetchWithOptionalAuth(
  args: { method: 'POST'; endpoint: string; body?: unknown; timeoutMs: number },
  accessToken?: string,
): Promise<Response> {
  const { timeoutMs, ...request } = args;
  // 재시도마다 새 상한 — 첫 요청의 시간을 이어 쓰지 않는다
  const send = (auth: { accessToken?: string; notifyUnauthorized?: boolean }) =>
    fetchServiceInstance.backendFetch({ ...request, ...auth, signal: timeoutSignal(timeoutMs) });
  if (!accessToken) return send({});
  // 게임 중 전역 로그아웃(로그인 화면 이동)으로 결과를 잃지 않게 401 이벤트를 끈다
  const response = await send({ accessToken, notifyUnauthorized: false });
  if (response.status !== 401) return response;
  // 401로 거절된 요청도 IP 스로틀(제출 초당 1)에 집계된다 — 같은 1초 창을 피해 재시도
  await wait(RETRY_AFTER_UNAUTHORIZED_MS);
  return send({});
}

// ==================== 제출 — 게임별 본문·검증 대기 재시도 ====================

/**
 * 제출 본문의 replay — DTO 필드만 싣는다(점수 등 정의 밖 필드는 422)
 * 테트리스는 das·arr를 최상위에, 그 밖의 게임은 게임별 값을 params에 싣는다 (defense D-018)
 */
const REPLAY_BODY_BUILDERS: { [G in GameType]: (replay: ReplayPayloadByGame[G]) => ReplayPayloadByGame[G] } = {
  tetris: ({ engineVersion, das, arr, frames, inputs }) => ({ engineVersion, das, arr, frames, inputs }),
  defense: ({ engineVersion, frames, inputs, params }) =>
    params ? { engineVersion, frames, inputs, params } : { engineVersion, frames, inputs },
};

function buildReplayBody<G extends GameType>(gameType: G, replay: ReplayPayloadByGame[G]): ReplayPayloadByGame[G] {
  const build: (replay: ReplayPayloadByGame[G]) => ReplayPayloadByGame[G] = REPLAY_BODY_BUILDERS[gameType];
  return build(replay);
}

/** Retry-After가 없거나 읽을 수 없을 때 (백엔드는 2초를 준다 — defense D-018) */
const VERIFY_BUSY_DEFAULT_WAIT_MS = 2000;
/** 이보다 오래 기다리라면 자동 재시도하지 않고 보관·수동 재시도로 넘긴다 (결과 화면을 오래 붙잡지 않게) */
const VERIFY_BUSY_MAX_WAIT_MS = 10_000;

/** 503 GAME_VERIFY_BUSY — 검증 대기열이 차서 세션을 그대로 둔 채 거절됐다(defense §B4). 같은 세션으로 다시 내도 된다 */
async function isVerifyBusy(response: Response): Promise<boolean> {
  if (response.status !== 503) return false;
  try {
    const body = (await response.clone().json()) as Partial<ApiErrorResponse> | null;
    return body?.code === 'GAME_VERIFY_BUSY';
  } catch {
    return false;
  }
}

/**
 * 자동 재시도까지 기다릴 시간 — Retry-After는 0 이상 정수 초(delay-seconds)만 읽는다
 * 없음·HTTP 날짜 형식·그 밖의 값은 기본값. 브라우저가 이 헤더를 못 읽는 경우(CORS 노출 헤더 아님)도 기본값이 된다
 * 제출 IP 스로틀(초당 1)에 다시 걸리지 않게 최소 1.1초. 너무 길면 null (자동 재시도 안 함)
 */
function verifyBusyWaitMs(response: Response): number | null {
  const raw = response.headers.get('Retry-After')?.trim() ?? '';
  if (!/^\d+$/.test(raw)) return VERIFY_BUSY_DEFAULT_WAIT_MS;
  const ms = Math.max(RETRY_AFTER_UNAUTHORIZED_MS, Number(raw) * 1000);
  return ms > VERIFY_BUSY_MAX_WAIT_MS ? null : ms;
}

// ==================== API ====================

/**
 * 게임 세션·시드 발급 — 로그인이면 토큰을 붙인다(선택 인증)
 * board: 보드가 여러 개인 게임의 플레이 방식(디펜스 endless·weekly) — 생략하면 본문 없이(테트리스는 보내면 422)
 * 503: GAME_SESSION_UNAVAILABLE(세션 저장소)·GAME_WEEKLY_UNAVAILABLE(주간만) — 플레이는 되고 등록만 안 된다
 */
export async function createGameSession(
  gameType: GameType,
  accessToken?: string,
  board?: GameMode,
): Promise<ApiResponse<GameSession>> {
  const response = await fetchWithOptionalAuth(
    board
      ? { method: 'POST', endpoint: `/api/v1/games/${gameType}/sessions`, body: { board }, timeoutMs: SESSION_TIMEOUT_MS }
      : { method: 'POST', endpoint: `/api/v1/games/${gameType}/sessions`, timeoutMs: SESSION_TIMEOUT_MS },
    accessToken,
  );

  if (!response.ok) {
    await handleApiError(response, {
      429: TOO_MANY,
      503: '지금은 랭킹 등록을 준비할 수 없습니다. 플레이는 그대로 할 수 있어요.',
      default: '게임 세션을 만들지 못했습니다.',
    });
  }

  return response.json();
}

/**
 * 리플레이 제출 — 점수는 서버가 리플레이로 계산한다(클라이언트 점수는 보내지 않는다)
 * 503 GAME_VERIFY_BUSY면 Retry-After만큼 기다렸다 1회 다시 낸다 — 그래도 실패하면 호출부가 보관·재시도로 다룬다
 */
export async function submitGameScore<G extends GameType>(
  gameType: G,
  request: SubmitScoreRequest<G>,
  accessToken?: string,
): Promise<ApiResponse<SubmitScoreResponse<ScoreDetailByGame[G]>>> {
  const { sessionId, playerName, replay } = request;
  const post = () =>
    fetchWithOptionalAuth(
      {
        method: 'POST',
        endpoint: `/api/v1/games/${gameType}/scores`,
        body: { sessionId, playerName, replay: buildReplayBody(gameType, replay) },
        timeoutMs: SUBMIT_TIMEOUT_MS,
      },
      accessToken,
    );

  let response = await post();
  if (await isVerifyBusy(response)) {
    const waitMs = verifyBusyWaitMs(response);
    if (waitMs !== null) {
      await wait(waitMs);
      response = await post();
    }
  }

  if (!response.ok) {
    await handleApiError(response, {
      409: '게임 세션이 만료되었거나 이미 사용되었습니다. 새 게임으로 다시 도전해주세요.',
      413: '플레이 기록이 너무 커서 등록하지 못했습니다.',
      422: '등록할 수 없는 기록입니다.',
      429: TOO_MANY,
      default: '기록을 등록하지 못했습니다.',
    });
  }

  return response.json();
}

/** 랭킹 보드 목록 (D-024) — 현재 등록받는 보드(current)와 지난 시즌·지난 주 */
export async function getGameBoards(gameType: GameType): Promise<ApiResponse<{ items: GameBoard[] }>> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/games/${gameType}/boards`,
  });

  if (!response.ok) {
    await handleApiError(response, { 429: TOO_MANY, default: '랭킹 보드를 불러오지 못했습니다.' });
  }

  return response.json();
}

/** 기간별 랭킹 — board(보드 키)를 생략하면 그 게임의 기본 보드 (테트리스 URL은 board 없이 그대로) */
export async function getGameRankings<G extends GameType>(
  gameType: G,
  period: RankingPeriod,
  limit: number,
  board?: string,
): Promise<ApiResponse<RankingList<ScoreDetailByGame[G]>>> {
  const params = new URLSearchParams({ period, limit: String(limit) });
  if (board) params.set('board', board);
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/games/${gameType}/rankings?${params.toString()}`,
  });

  if (!response.ok) {
    await handleApiError(response, { 429: TOO_MANY, default: '랭킹을 불러오지 못했습니다.' });
  }

  return response.json();
}

/** 기록 1건의 리플레이 — 숨김·없는 기록은 404 */
export async function getGameReplay<G extends GameType>(
  gameType: G,
  scoreId: number,
): Promise<ApiResponse<ReplayDataByGame[G]>> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/games/${gameType}/scores/${scoreId}/replay`,
    signal: timeoutSignal(REPLAY_TIMEOUT_MS),
  });

  if (!response.ok) {
    await handleApiError(response, {
      404: '기록을 찾을 수 없습니다.',
      429: TOO_MANY,
      default: '리플레이를 불러오지 못했습니다.',
    });
  }

  return response.json();
}
