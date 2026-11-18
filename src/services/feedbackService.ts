import fetchServiceInstance from './FetchService';
import type { ApiResponse } from '@/types/api';
import { type ApiErrorRules, type ErrorMessageMap, statusCodeMap, throwApiError } from './apiError';
import type {
  CreateFeedbackRequest,
  FeedbackDetail,
  GetMyFeedbacksQuery,
  MyFeedbackPage,
} from '@/types/feedback';

// ==================== 공통 에러 처리 ====================

/** 실패 응답 → ApiError — 규칙은 공용 apiError.ts, 이 서비스의 차이는 아래 규칙 */
const ERROR_RULES: ApiErrorRules = { statusCodes: statusCodeMap(422, 429) };

function handleApiError(response: Response, errorMessages: ErrorMessageMap): Promise<never> {
  return throwApiError(response, errorMessages, ERROR_RULES);
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
