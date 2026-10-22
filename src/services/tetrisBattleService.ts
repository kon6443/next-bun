import fetchServiceInstance from './FetchService';
import { ApiError, type ApiErrorResponse, type ApiResponse, createApiError } from '@/types/api';
import type { BattleReplayInput } from '@/app/games/tetris/battle-engine';

/**
 * 테트리스 대전 REST — 경기 후 리플레이 제출 (DESIGN §17-1)
 * 실시간 진행은 소켓(/tetris-battle), 여기는 경기가 끝난 뒤 검증·저장용 제출만
 */

// ==================== 공통 에러 처리 ====================

type ErrorMessageMap = {
  403?: string;
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
 * 선택 인증 호출 — 만료·잘못된 토큰은 백엔드가 401로 막으므로 토큰 없이 1회 재시도한다 (gameService.ts와 같은 방식)
 * 제출 인증은 본문의 playerToken이라 로그인 토큰이 없어도 된다
 */
async function fetchWithOptionalAuth(args: { method: 'POST'; endpoint: string; body?: unknown }, accessToken?: string): Promise<Response> {
  if (!accessToken) return fetchServiceInstance.backendFetch(args);
  // 결과 화면에서 전역 로그아웃(로그인 화면 이동)이 일어나지 않게 401 이벤트를 끈다
  const response = await fetchServiceInstance.backendFetch({ ...args, accessToken, notifyUnauthorized: false });
  if (response.status !== 401) return response;
  await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_UNAUTHORIZED_MS));
  return fetchServiceInstance.backendFetch(args);
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
