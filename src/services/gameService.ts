import fetchServiceInstance from './FetchService';
import { ApiError, type ApiErrorResponse, type ApiResponse, createApiError } from '@/types/api';
import type {
  GameSession,
  GameType,
  RankingList,
  RankingPeriod,
  ReplayData,
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

/**
 * 선택 인증 호출 — 만료·잘못된 토큰은 백엔드가 401로 막으므로(토큰이 없어야 비로그인 통과) 토큰 없이 1회 재시도한다
 * 제출도 가드가 먼저 막아 세션이 소모되지 않으니 재시도해도 안전하다
 */
async function fetchWithOptionalAuth(
  args: { method: 'POST'; endpoint: string; body?: unknown },
  accessToken?: string,
): Promise<Response> {
  if (!accessToken) return fetchServiceInstance.backendFetch(args);
  // 게임 중 전역 로그아웃(로그인 화면 이동)으로 결과를 잃지 않게 401 이벤트를 끈다
  const response = await fetchServiceInstance.backendFetch({ ...args, accessToken, notifyUnauthorized: false });
  if (response.status !== 401) return response;
  // 401로 거절된 요청도 IP 스로틀(제출 초당 1)에 집계된다 — 같은 1초 창을 피해 재시도
  await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_UNAUTHORIZED_MS));
  return fetchServiceInstance.backendFetch(args);
}

// ==================== API ====================

/**
 * 게임 세션·시드 발급 — 로그인이면 토큰을 붙인다(선택 인증)
 */
export async function createGameSession(
  gameType: GameType,
  accessToken?: string,
): Promise<ApiResponse<GameSession>> {
  const response = await fetchWithOptionalAuth(
    { method: 'POST', endpoint: `/api/v1/games/${gameType}/sessions` },
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
 */
export async function submitGameScore(
  gameType: GameType,
  request: SubmitScoreRequest,
  accessToken?: string,
): Promise<ApiResponse<SubmitScoreResponse>> {
  const { sessionId, playerName, replay } = request;
  // DTO 필드만 싣는다 — 점수 등 정의 밖 필드는 422 (replay 안도 마찬가지)
  const response = await fetchWithOptionalAuth(
    {
      method: 'POST',
      endpoint: `/api/v1/games/${gameType}/scores`,
      body: {
        sessionId,
        playerName,
        replay: {
          engineVersion: replay.engineVersion,
          das: replay.das,
          arr: replay.arr,
          frames: replay.frames,
          inputs: replay.inputs,
        },
      },
    },
    accessToken,
  );

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

/** 기간별 랭킹 */
export async function getGameRankings(
  gameType: GameType,
  period: RankingPeriod,
  limit: number,
): Promise<ApiResponse<RankingList>> {
  const params = new URLSearchParams({ period, limit: String(limit) });
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
export async function getGameReplay(gameType: GameType, scoreId: number): Promise<ApiResponse<ReplayData>> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/games/${gameType}/scores/${scoreId}/replay`,
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
