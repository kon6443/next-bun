import fetchServiceInstance from './FetchService';
import { ApiError, type ApiErrorResponse, type ApiResponse, createApiError } from '@/types/api';
import type { BattleReplayInput } from '@/app/games/tetris/battle-engine';

/**
 * 테트리스 대전 REST — 경기 후 리플레이 제출(DESIGN §17-1)과 저장된 경기 조회(§17-3·§18)
 * 실시간 진행은 소켓(/tetris-battle), 여기는 경기가 끝난 뒤의 제출·조회만
 */

// ==================== 공통 에러 처리 ====================

type ErrorMessageMap = {
  403?: string;
  404?: string;
  409?: string;
  410?: string;
  413?: string;
  429?: string;
  default: string;
};

/**
 * API 응답 에러를 ApiError로 던진다 (gameService.ts의 handleApiError와 같은 규칙)
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
    410: 'GONE',
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

/** 백엔드 short 스로틀 창(1000ms) + 경계 오차 여유 */
const RETRY_AFTER_UNAUTHORIZED_MS = 1100;

/**
 * 응답 대기 상한 — 망이 멈추면 "기록 저장 중"·"경기 저장 중"·재생 준비에 영원히 머물지 않고 기존 실패·재시도 분기로 간다
 * (gameService.ts FE-08과 같은 방식). 시간이 지나면 TimeoutError → NetworkError(다시 시도 대상)
 */
export const SUBMIT_TIMEOUT_MS = 30_000;
export const LOAD_TIMEOUT_MS = 15_000;

/** AbortSignal.timeout이 없는 오래된 브라우저에서는 상한 없이 */
function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
}

/**
 * 선택 인증 호출 — 만료·잘못된 토큰은 백엔드가 401로 막으므로 토큰 없이 1회 재시도한다 (gameService.ts와 같은 방식)
 * 제출 인증은 본문의 playerToken이라 로그인 토큰이 없어도 된다
 */
async function fetchWithOptionalAuth(args: { method: 'POST'; endpoint: string; body?: unknown }, accessToken?: string): Promise<Response> {
  // 재시도마다 새 상한 — 첫 요청의 시간을 이어 쓰지 않는다
  const send = (auth: { accessToken?: string; notifyUnauthorized?: boolean }) =>
    fetchServiceInstance.backendFetch({ ...args, ...auth, signal: timeoutSignal(SUBMIT_TIMEOUT_MS) });
  if (!accessToken) return send({});
  // 결과 화면에서 전역 로그아웃(로그인 화면 이동)이 일어나지 않게 401 이벤트를 끈다
  const response = await send({ accessToken, notifyUnauthorized: false });
  if (response.status !== 401) return response;
  await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_UNAUTHORIZED_MS));
  return send({});
}

// ==================== API ====================

export type BattleReplayVerdict = 'VERIFIED' | 'INVALID';

export type SubmitBattleReplayRequest = {
  /** 방 입장 때 받은 재연결 토큰 — 제출 인증 */
  playerToken: string;
  replay: BattleReplayInput;
};

/**
 * 경기 리플레이 제출 — 검증 실패도 201 + verdict INVALID
 * 409 이미 제출 · 410 마감(종료 후 60초) · 403 토큰 불일치 · 413 크기 초과
 */
export async function submitBattleReplay(
  matchId: string,
  body: SubmitBattleReplayRequest,
  accessToken?: string,
): Promise<ApiResponse<{ verdict: BattleReplayVerdict }>> {
  const response = await fetchWithOptionalAuth(
    { method: 'POST', endpoint: `/api/v1/tetris-battle/matches/${encodeURIComponent(matchId)}/replays`, body },
    accessToken,
  );

  if (!response.ok) {
    await handleApiError(response, {
      403: '이 경기의 참가자 정보가 맞지 않습니다.',
      409: '이미 제출한 기록입니다.',
      410: '기록 제출 시간이 지났습니다.',
      413: '기록이 너무 커서 저장할 수 없습니다.',
      429: '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.',
      default: '기록을 저장하지 못했습니다.',
    });
  }

  return response.json();
}

// ==================== 조회 ====================

/** 탈락 이유 — 우승자는 null. 새로고침 기권(D-020)도 topout */
export type BattleKoReason = 'topout' | 'disconnect' | 'leave';

/** 경기 참가자 — 백엔드 BattleMatchPlayerDto */
export type BattleMatchPlayer = {
  playerId: string;
  name: string;
  /** 1 = 우승. 동순위 없음 */
  place: number;
  kos: number;
  /** 보낸 줄 */
  sent: number;
  /** 받은 줄 */
  received: number;
  pieces: number;
  maxCombo: number;
  frames: number;
  koReason: BattleKoReason | null;
  /**
   * MISSING = 리플레이 미제출(재생할 기록 없음), INVALID = 제출했지만 검증 실패(기록·재생에서 빠진다 — 리플레이 GET 404, D-004·D-008)
   * 통계(place·kos 등)는 서버 값 그대로다
   */
  verdict: 'VERIFIED' | 'MISSING' | 'INVALID';
};

/** 저장된 경기 — 백엔드 BattleMatchDto. 숨김·미저장 경기는 404 (DISPUTED도 200 — 검증 실패 참가자만 빠진다, D-008) */
export type BattleMatch = {
  matchId: string;
  roomName: string;
  playerCount: number;
  /** UTC ISO 8601 */
  startedAt: string;
  endedAt: string;
  /** 순위 오름차순 */
  players: BattleMatchPlayer[];
  /** 검증 실패(INVALID) 참가자가 있다 */
  disputed: boolean;
};

/** 한 참가자의 대전 리플레이 — 백엔드 BattleReplayDetailDto (VERIFIED만) */
export type BattleReplayDetail = BattleReplayInput & {
  matchId: string;
  playerId: string;
  /** 가비지 이벤트마다 보낸 사람 playerId(garbage 로그와 같은 순서, 모르면 null) — 이 필드가 생긴 뒤 저장된 경기에만 있다 */
  garbageFrom?: (string | null)[];
};

/** 경로의 matchId 형식 — 백엔드 MATCH_ID_PATTERN과 같다. 맞지 않으면 묻지 않고 404 */
export function isBattleMatchId(raw: string): boolean {
  return /^[A-Za-z0-9_-]{16}$/.test(raw);
}

/** 저장된 경기 요약 — 404 TETRIS_BATTLE_MATCH_NOT_FOUND(없음·숨김·DISPUTED·아직 저장 전) */
export async function getBattleMatch(matchId: string): Promise<ApiResponse<BattleMatch>> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/tetris-battle/matches/${encodeURIComponent(matchId)}`,
    signal: timeoutSignal(LOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    await handleApiError(response, {
      404: '공개되지 않은 경기예요.',
      429: '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.',
      default: '경기 기록을 불러오지 못했습니다.',
    });
  }
  return response.json();
}

/** 참가자 리플레이 — 404 TETRIS_BATTLE_REPLAY_NOT_FOUND(미제출·참가자 없음) */
export async function getBattleReplay(matchId: string, playerId: string): Promise<ApiResponse<BattleReplayDetail>> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/tetris-battle/matches/${encodeURIComponent(matchId)}/replays/${encodeURIComponent(playerId)}`,
    signal: timeoutSignal(LOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    await handleApiError(response, {
      404: '이 참가자의 기록이 없어요.',
      429: '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.',
      default: '기록을 불러오지 못했습니다.',
    });
  }
  return response.json();
}

// ==================== 입구 — 로비 방 수·최근 경기 (DESIGN §19) ====================

/** 지금 로비의 방 수 — 소켓 없이 테트리스 홈에서 쓴다 */
export type BattleLobbyStats = {
  /** 입장할 수 있는 대기 방 */
  waitingRooms: number;
  /** 경기 중인 방 */
  playingRooms: number;
};

export async function getBattleLobbyStats(): Promise<ApiResponse<BattleLobbyStats>> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: '/api/v1/tetris-battle/lobby',
    signal: timeoutSignal(LOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    await handleApiError(response, {
      429: '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.',
      default: '대전 방 정보를 불러오지 못했습니다.',
    });
  }
  return response.json();
}

/** 최근 경기 목록 항목 — 저장된 비숨김 경기(DISPUTED 포함, D-008) */
export type BattleMatchListItem = {
  matchId: string;
  roomName: string;
  playerCount: number;
  /** UTC ISO 8601 */
  endedAt: string;
  /** place 1 — 1위가 검증 실패여도 그대로 (D-008) */
  winnerName: string;
  /** 순위 오름차순 */
  players: { name: string; place: number }[];
  /** 검증 실패(INVALID) 참가자가 있다 */
  disputed: boolean;
};

export type BattleMatchList = {
  items: BattleMatchListItem[];
  /** 다음 페이지 커서 — 마지막이면 null */
  nextCursor: string | null;
};

/** 최근 경기 — 최신순 커서 페이지(limit 1~20, 기본 10). 잘못된 cursor는 422 VALIDATION_ERROR */
export async function getBattleMatchList(params: { limit?: number; cursor?: string | null } = {}): Promise<ApiResponse<BattleMatchList>> {
  const query: Record<string, string> = {};
  if (params.limit !== undefined) query.limit = String(params.limit);
  if (params.cursor) query.cursor = params.cursor;
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: '/api/v1/tetris-battle/matches',
    query,
    signal: timeoutSignal(LOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    await handleApiError(response, {
      429: '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.',
      default: '최근 대전을 불러오지 못했습니다.',
    });
  }
  return response.json();
}
