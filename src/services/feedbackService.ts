import fetchServiceInstance from './FetchService';
import { ApiError, type ApiErrorResponse, type ApiResponse, createApiError } from '@/types/api';
import type {
  CreateFeedbackRequest,
  FeedbackDetail,
  GetMyFeedbacksQuery,
  MyFeedbackPage,
} from '@/types/feedback';

// ==================== 공통 에러 처리 ====================

type ErrorMessageMap = {
  404?: string;
  429?: string;
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
    422: 'VALIDATION_ERROR',
    429: 'TOO_MANY_REQUESTS',
    500: 'INTERNAL_SERVER_ERROR',
  };

  throw new ApiError(
    defaultCodeMap[response.status] || 'UNKNOWN_ERROR',
    errorData?.message || errorMessages[response.status as keyof ErrorMessageMap] || errorMessages.default,
    response.status,
  );
}

// ==================== API ====================

/**
 * 피드백 작성
 * 바디는 DTO 필드만 싣는다 — pagePath·buildSha는 값이 있을 때만
 */
export async function createFeedback(
  request: CreateFeedbackRequest,
  accessToken: string,
): Promise<ApiResponse<FeedbackDetail>> {
  const { category, title, content, pagePath, buildSha } = request;
  const body: CreateFeedbackRequest = {
    category,
    title,
    content,
    ...(pagePath ? { pagePath } : {}),
    ...(buildSha ? { buildSha } : {}),
  };

  const response = await fetchServiceInstance.backendFetch({
    method: 'POST',
    endpoint: '/api/v1/feedbacks',
    body,
    accessToken,
  });

  if (!response.ok) {
    await handleApiError(response, {
      429: '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.',
      default: '피드백을 보내지 못했습니다.',
    });
  }

  return response.json();
}

/**
 * 내 피드백 목록 (최신순, beforeId 커서)
 */
export async function getMyFeedbacks(
  accessToken: string,
  query: GetMyFeedbacksQuery = {},
): Promise<ApiResponse<MyFeedbackPage>> {
  const params = new URLSearchParams();
  if (query.beforeId !== undefined) params.set('beforeId', String(query.beforeId));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  const queryString = params.toString();

  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/feedbacks/me${queryString ? `?${queryString}` : ''}`,
    accessToken,
  });

  if (!response.ok) {
    await handleApiError(response, { default: '피드백 목록을 불러오지 못했습니다.' });
  }

  return response.json();
}

/**
 * 피드백 상세 — 남의 피드백도 404 (FEEDBACK_NOT_FOUND)
 */
export async function getFeedbackDetail(
  feedbackId: number,
  accessToken: string,
): Promise<ApiResponse<FeedbackDetail>> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/feedbacks/${feedbackId}`,
    accessToken,
  });

  if (!response.ok) {
    await handleApiError(response, {
      404: '피드백을 찾을 수 없습니다.',
      default: '피드백을 불러오지 못했습니다.',
    });
  }

  return response.json();
}
