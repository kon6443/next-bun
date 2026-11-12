import fetchServiceInstance from './FetchService';
import { ApiError, type ApiErrorResponse, type ApiResponse, createApiError } from '@/types/api';
import type { Action, MatchConfig } from '@/app/games/fortress/engine';
import type { FortressTankSkin } from '@/types/fortressSocket';

/**
 * 포트리스 REST — 저장된 경기 결과·리플레이·최근 목록(DESIGN §12, 게스트 공개)과 포인트·탱크 스킨(§13, 로그인 전용)
 * 실시간 진행은 소켓(/fortress), 여기는 경기가 끝난 뒤의 조회와 계정 스킨만
 */

// ==================== 공통 에러 처리 ====================

type ErrorMessageMap = {
  403?: string;
  404?: string;
  409?: string;
  429?: string;
  default: string;
};

/**
 * API 응답 에러를 ApiError로 던진다 (tetrisBattleService.ts의 handleApiError와 같은 규칙)
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

/** 응답 대기 상한 — 망이 멈추면 로딩에 머물지 않고 실패·다시 시도 분기로 간다(tetrisBattleService와 같다) */
export const LOAD_TIMEOUT_MS = 15_000;

/** AbortSignal.timeout이 없는 오래된 브라우저에서는 상한 없이 */
function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
}

const TOO_MANY = '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.';

// ==================== 결과·리플레이·최근 목록 (§12, 인증 없음) ====================

export type FortressMode = 'ffa' | 'team';
/** team 승리만 team 0|1 — ffa·무승부는 null */
export type FortressMatchResult = { kind: 'win' | 'draw'; team: 0 | 1 | null };

/** 저장된 경기 참가자 — 순위 오름차순, 같으면 slot(같은 순위는 1,1,3) */
export type FortressMatchPlayer = {
  playerId: string;
  name: string;
  slot: number;
  team: 0 | 1 | null;
  tankId: number;
  hp: number;
  damage: number;
  kos: number;
  place: number;
};

export type FortressMatch = {
  matchId: string;
  /** 배포 전 시작 경기는 null */
  roomName: string | null;
  mode: FortressMode;
  mapId: string;
  seed: number;
  engineVersion: number;
  playerCount: number;
  turns: number;
  result: FortressMatchResult;
  /** UTC ISO 8601 */
  startedAt: string;
  endedAt: string;
  players: FortressMatchPlayer[];
};

/** 리플레이 본문 — 클라이언트가 같은 엔진으로 actions를 재적용하고 마지막 stateHash와 대조한다 */
export type FortressReplay = {
  matchId: string;
  engineVersion: number;
  config: MatchConfig;
  actions: Action[];
  /** F7 전 리플레이는 skin이 default로 채워져 온다 — 없거나 모르는 id면 화면이 default로 그린다 */
  slots: { slot: number; playerId: string; name: string; skin?: FortressTankSkin }[];
  stateHash: string;
};

export type FortressMatchListItem = {
  matchId: string;
  roomName: string | null;
  mode: FortressMode;
  mapId: string;
  playerCount: number;
  turns: number;
  result: FortressMatchResult;
  /** UTC ISO 8601 */
  endedAt: string;
  /** 순위 오름차순 */
  players: { name: string; slot: number; team: 0 | 1 | null; place: number }[];
};

export type FortressMatchList = {
  items: FortressMatchListItem[];
  /** 불투명 문자열 — 그대로 다음 요청에 넘긴다 */
  nextCursor: string | null;
};

/** 경로의 matchId 형식 — 서버 경기 id(16자). 맞지 않으면 묻지 않고 404 */
export function isFortressMatchId(raw: string): boolean {
  return /^[A-Za-z0-9_-]{16}$/.test(raw);
}

/** 저장된 경기 결과 — 404 FORTRESS_MATCH_NOT_FOUND(없음·숨김·진행 중·아직 저장 전) */
export async function getFortressMatch(matchId: string): Promise<ApiResponse<FortressMatch>> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/fortress/matches/${encodeURIComponent(matchId)}`,
    signal: timeoutSignal(LOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    await handleApiError(response, { 404: '공개되지 않은 경기예요.', 429: TOO_MANY, default: '경기 기록을 불러오지 못했습니다.' });
  }
  return response.json();
}

/** 리플레이 — 404 FORTRESS_MATCH_NOT_FOUND · FORTRESS_REPLAY_NOT_FOUND */
export async function getFortressReplay(matchId: string): Promise<ApiResponse<FortressReplay>> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/fortress/matches/${encodeURIComponent(matchId)}/replay`,
    signal: timeoutSignal(LOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    await handleApiError(response, { 404: '이 경기의 리플레이가 없어요.', 429: TOO_MANY, default: '리플레이를 불러오지 못했습니다.' });
  }
  return response.json();
}

/** 최근 경기 — 기본 10·최대 20, 커서는 받은 그대로(422 = 잘못된 커서 → 처음부터) */
export async function getFortressMatchList(params: { limit?: number; cursor?: string | null } = {}): Promise<ApiResponse<FortressMatchList>> {
  const query: Record<string, string> = {};
  if (params.limit !== undefined) query.limit = String(params.limit);
  if (params.cursor) query.cursor = params.cursor;
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: '/api/v1/fortress/matches',
    query,
    signal: timeoutSignal(LOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    await handleApiError(response, { 429: TOO_MANY, default: '최근 경기를 불러오지 못했습니다.' });
  }
  return response.json();
}

// ==================== 포인트 (§13, 로그인 전용) ====================

/** 이 경기에서 내가 얻은 포인트 — participant = 로그인으로 참가했는지, 적립이 없으면 earned 0·memo null */
export type FortressMatchPoints = { matchId: string; participant: boolean; earned: number; memo: string | null };

/** 저장 전이면 서버가 그 자리에서 저장하므로 1회 조회로 충분하다. 401은 전역 로그아웃 없이 던진다(결과 화면을 잃지 않게) */
export async function getFortressMatchPoints(matchId: string, accessToken: string): Promise<ApiResponse<FortressMatchPoints>> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/fortress/matches/${encodeURIComponent(matchId)}/points`,
    accessToken,
    notifyUnauthorized: false,
    signal: timeoutSignal(LOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    await handleApiError(response, { 404: '경기 기록을 찾지 못했어요.', 429: TOO_MANY, default: '포인트를 불러오지 못했습니다.' });
  }
  return response.json();
}

// ==================== 탱크 스킨 (§13, 로그인 전용) ====================

export type FortressSkinItem = {
  id: string;
  unlock: 'default' | 'free' | (string & {});
  owned: boolean;
  equipped: boolean;
  /** 1~maxLevel */
  level: number;
  /** 한 단계 올리는 비용 — 만렙이면 null */
  nextCost: number | null;
};

export type FortressSkins = {
  equipped: FortressTankSkin;
  points: { earned: number; spent: number; balance: number };
  maxLevel: number;
  /** [i] = Lv(i+1) → Lv(i+2) 비용 */
  levelCosts: number[];
  items: FortressSkinItem[];
};

/** 내 탱크 스킨 — 401은 전역 로그아웃 없이 던진다(화면이 "다시 로그인"으로 안내) */
export async function getMyFortressSkins(accessToken: string): Promise<ApiResponse<FortressSkins>> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: '/api/v1/fortress/skins/me',
    accessToken,
    notifyUnauthorized: false,
    signal: timeoutSignal(LOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    await handleApiError(response, { 429: TOO_MANY, default: '탱크 스킨을 불러오지 못했습니다.' });
  }
  return response.json();
}

/** 장착 — 카탈로그 밖 422 USER_SKIN_UNKNOWN · 미보유 403 USER_SKIN_NOT_OWNED */
export async function equipFortressSkin(skinId: string, accessToken: string): Promise<ApiResponse<FortressSkins>> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'PUT',
    endpoint: '/api/v1/fortress/skins/me',
    body: { skinId },
    accessToken,
    notifyUnauthorized: false,
    signal: timeoutSignal(LOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    await handleApiError(response, { 403: '아직 갖지 않은 스킨이에요.', 429: TOO_MANY, default: '스킨을 바꾸지 못했습니다.' });
  }
  return response.json();
}

/**
 * 강화 — level은 목표 레벨(지금 + 1). 이미 그 레벨 이상이면 차감 없이 200(중복 클릭 안전)
 * 에러: 미보유 403 USER_SKIN_NOT_OWNED · 단계 건너뜀 409 USER_SKIN_LEVEL_MISMATCH · 포인트 부족 409 USER_POINTS_INSUFFICIENT · 422 · 404 USER_NOT_FOUND
 */
export async function upgradeFortressSkin(request: { skinId: string; level: number }, accessToken: string): Promise<ApiResponse<FortressSkins>> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'POST',
    endpoint: '/api/v1/fortress/skins/me/upgrade',
    body: request,
    accessToken,
    notifyUnauthorized: false,
    signal: timeoutSignal(LOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    await handleApiError(response, { 403: '아직 갖지 않은 스킨이에요.', 409: '강화하지 못했어요. 화면을 새로 고쳐 주세요.', 429: TOO_MANY, default: '스킨을 강화하지 못했습니다.' });
  }
  return response.json();
}
