import fetchServiceInstance from './FetchService';
import { ApiError, type ApiErrorResponse, type ApiResponse, createApiError } from '@/types/api';
import type {
  GameBoard,
  SessionBoard,
  GameSession,
  GameType,
  HallOfFame,
  PopularReplayList,
  PopularSort,
  RankingList,
  RankingPeriod,
  ReplayDataByGame,
  ReplayPayloadByGame,
  ReplayViewResult,
  ReplayWatchResult,
  ScoreDetailByGame,
  ScoreSummary,
  SubmitScoreRequest,
  SubmitScoreResponse,
  TetrisSkinCatalog,
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

/** 백엔드 short 스로틀 창(1000ms) + 경계 오차 여유 — 같은 제출을 이보다 먼저 다시 내지 않는다 */
const THROTTLE_WINDOW_MS = 1100;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 응답 대기 상한 — 망이 멈추면 "준비 중"·"등록 중"·로딩에 영원히 머물지 않고 기존 실패·재시도 분기로 간다(FE-08)
 * 제출은 서버 검증이 오래 걸릴 수 있어 넉넉히. 시간이 지나면 TimeoutError → NetworkError(다시 시도 대상)
 */
export const SESSION_TIMEOUT_MS = 10_000;
export const SUBMIT_TIMEOUT_MS = 30_000;
export const REPLAY_TIMEOUT_MS = 15_000;
/** 랭킹·보드 목록 — 응답이 멈추면 skeleton·예상 순위 "…"에 머물지 않고 기존 오류·다시 시도로 (games-polish FE-03) */
export const RANKING_TIMEOUT_MS = 10_000;

/** AbortSignal.timeout이 없는 오래된 브라우저에서는 상한 없이 */
function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
}

/**
 * 선택 인증 호출 — 토큰이 있으면 싣고, 없으면 비로그인으로 보낸다
 * 토큰이 만료·무효라 401이면 토큰 없이 다시 보내지 않는다 — 로그인 사용자의 기록이 익명으로 남지 않게(USER_ID 누락)
 * 호출부가 401(classifySubmitError 'auth')을 받아 기록을 보관하고 다시 로그인하게 안내한다. 세션 발급도 같다
 * 게임 중 전역 로그아웃(로그인 화면 이동)으로 결과를 잃지 않게 401 이벤트는 끈다
 */
async function fetchWithOptionalAuth(
  args: { method: 'POST'; endpoint: string; body?: unknown; timeoutMs: number },
  accessToken?: string,
): Promise<Response> {
  const { timeoutMs, ...request } = args;
  // 재시도마다 새 상한 — 첫 요청의 시간을 이어 쓰지 않는다
  return fetchServiceInstance.backendFetch({
    ...request,
    ...(accessToken ? { accessToken, notifyUnauthorized: false } : {}),
    signal: timeoutSignal(timeoutMs),
  });
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
  const ms = Math.max(THROTTLE_WINDOW_MS, Number(raw) * 1000);
  return ms > VERIFY_BUSY_MAX_WAIT_MS ? null : ms;
}

// ==================== API ====================

/**
 * 게임 세션·시드 발급 — 로그인이면 토큰을 붙인다(선택 인증)
 * target: 플레이 방식(디펜스 endless·weekly, 테트리스 daily) 또는 도전장({ challengeScoreId } — 테트리스만, 원본 기록의 seed로)
 *   생략하면 본문 없이(그 게임의 기본 보드)
 * 도전장: 404 GAME_SCORE_NOT_FOUND(원본 없음·숨김·공개 전) · 409 GAME_CHALLENGE_EXPIRED(엔진 버전이 바뀜)
 * 503: GAME_SESSION_UNAVAILABLE(세션 저장소)·GAME_WEEKLY_UNAVAILABLE(주간만)·GAME_DAILY_UNAVAILABLE(데일리 비밀값 없음) — 플레이는 되고 등록만 안 된다
 */
export async function createGameSession(
  gameType: GameType,
  accessToken?: string,
  target?: SessionBoard | { challengeScoreId: number },
): Promise<ApiResponse<GameSession>> {
  const body = target === undefined ? undefined : typeof target === 'string' ? { board: target } : { challengeScoreId: target.challengeScoreId };
  const response = await fetchWithOptionalAuth(
    body
      ? { method: 'POST', endpoint: `/api/v1/games/${gameType}/sessions`, body, timeoutMs: SESSION_TIMEOUT_MS }
      : { method: 'POST', endpoint: `/api/v1/games/${gameType}/sessions`, timeoutMs: SESSION_TIMEOUT_MS },
    accessToken,
  );

  if (!response.ok) {
    await handleApiError(response, {
      404: '도전할 기록을 찾을 수 없습니다.',
      409: '지난 버전 게임의 기록이라 도전할 수 없습니다.',
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

  const startedAt = Date.now();
  let response = await post();
  if (await isVerifyBusy(response)) {
    const waitMs = verifyBusyWaitMs(response);
    // 첫 시도가 이미 오래 걸렸으면(응답 지연) 자동 재시도하지 않고 호출부의 보관·다시 등록으로 — "등록 중"을 끝없이 끌지 않게 (games-polish FE-50)
    if (waitMs !== null && Date.now() - startedAt + waitMs <= SUBMIT_TIMEOUT_MS) {
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

/**
 * 테트리스 스킨 도감 (D-005) — 누구나. 토큰이 있으면 보유·장착을 표시한다
 * 만료 토큰은 401(조회라 익명으로 바꿔 다시 받는 것은 호출부가 정한다 — 로그인 만료 안내와 함께)
 */
export async function getTetrisSkinCatalog(accessToken?: string): Promise<ApiResponse<TetrisSkinCatalog>> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: '/api/v1/games/tetris/skins',
    ...(accessToken ? { accessToken, notifyUnauthorized: false } : {}),
    signal: timeoutSignal(RANKING_TIMEOUT_MS),
  });

  if (!response.ok) {
    await handleApiError(response, { 429: TOO_MANY, default: '스킨 목록을 불러오지 못했습니다.' });
  }

  return response.json();
}

/** 랭킹 보드 목록 (D-024) — 현재 등록받는 보드(current)와 지난 시즌·지난 주 */
export async function getGameBoards(gameType: GameType): Promise<ApiResponse<{ items: GameBoard[] }>> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/games/${gameType}/boards`,
    signal: timeoutSignal(RANKING_TIMEOUT_MS),
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
    signal: timeoutSignal(RANKING_TIMEOUT_MS),
  });

  if (!response.ok) {
    await handleApiError(response, { 429: TOO_MANY, default: '랭킹을 불러오지 못했습니다.' });
  }

  return response.json();
}

/**
 * 기록 1건 요약 — rank는 그 보드 전체 기간 순위(백엔드 games.service rankOf(…, null)). 숨김·없는 기록은 404
 * 랭킹 목록(상위 50) 밖의 강조 기록 안내에 쓴다 (games-polish FE-14·Q-S4)
 */
export async function getGameScore<G extends GameType>(gameType: G, scoreId: number): Promise<ApiResponse<ScoreSummary<ScoreDetailByGame[G]>>> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/games/${gameType}/scores/${scoreId}`,
    signal: timeoutSignal(RANKING_TIMEOUT_MS),
  });

  if (!response.ok) {
    await handleApiError(response, { 404: '기록을 찾을 수 없습니다.', 429: TOO_MANY, default: '기록을 불러오지 못했습니다.' });
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

/** 리플레이 조회 기록 — 본문 없이. 브라우저당 하루 1회 거르기는 호출부(replayViews) 몫, 서버가 세지 않아도(counted=false) 200 */
export async function recordReplayView(gameType: GameType, scoreId: number): Promise<ApiResponse<ReplayViewResult>> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'POST',
    endpoint: `/api/v1/games/${gameType}/scores/${scoreId}/views`,
    signal: timeoutSignal(RANKING_TIMEOUT_MS),
  });

  if (!response.ok) {
    await handleApiError(response, { 404: '기록을 찾을 수 없습니다.', 429: TOO_MANY, default: '조회 기록을 남기지 못했습니다.' });
  }

  return response.json();
}

/** 시청 시간 보고 1회 상한(ms) — 백엔드 검증 범위 1~120000 */
export const WATCH_REPORT_MAX_MS = 120_000;

/**
 * 시청 시간 보고 — ms는 쿼리로만, 본문·Content-Type 없이(CORS preflight 없는 단순 요청이라 keepalive로 탭을 닫을 때도 보낼 수 있다)
 * keepalive: 화면이 사라지는 순간(탭 숨김·이동)에도 요청을 끝까지 보낸다
 */
export async function reportReplayWatch(
  gameType: GameType,
  scoreId: number,
  ms: number,
  options: { keepalive?: boolean } = {},
): Promise<ApiResponse<ReplayWatchResult>> {
  const params = new URLSearchParams({ ms: String(ms) });
  const response = await fetchServiceInstance.backendFetch({
    method: 'POST',
    endpoint: `/api/v1/games/${gameType}/scores/${scoreId}/watch?${params.toString()}`,
    keepalive: options.keepalive,
    signal: timeoutSignal(RANKING_TIMEOUT_MS),
  });

  if (!response.ok) {
    await handleApiError(response, { 404: '기록을 찾을 수 없습니다.', 429: TOO_MANY, default: '시청 시간을 남기지 못했습니다.' });
  }

  return response.json();
}

/** 기간별 인기 리플레이 — board(보드 키)를 생략하면 그 게임의 기본 보드. 진행 중인 디펜스 주간 보드는 빈 목록 */
export async function getPopularReplays<G extends GameType>(
  gameType: G,
  query: { period: RankingPeriod; sort: PopularSort; limit: number; board?: string },
): Promise<ApiResponse<PopularReplayList<ScoreDetailByGame[G]>>> {
  const params = new URLSearchParams({ period: query.period, sort: query.sort, limit: String(query.limit) });
  if (query.board) params.set('board', query.board);
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/games/${gameType}/popular-replays?${params.toString()}`,
    signal: timeoutSignal(RANKING_TIMEOUT_MS),
  });

  if (!response.ok) {
    await handleApiError(response, { 429: TOO_MANY, default: '인기 리플레이를 불러오지 못했습니다.' });
  }

  return response.json();
}

/** 명예의 전당 — 지난 기간별 1~3위 */
export async function getHallOfFame<G extends GameType>(gameType: G): Promise<ApiResponse<HallOfFame<ScoreDetailByGame[G]>>> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/games/${gameType}/hall-of-fame`,
    signal: timeoutSignal(RANKING_TIMEOUT_MS),
  });

  if (!response.ok) {
    await handleApiError(response, { 429: TOO_MANY, default: '명예의 전당을 불러오지 못했습니다.' });
  }

  return response.json();
}
