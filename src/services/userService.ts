import fetchServiceInstance from './FetchService';
import { ApiError, type ApiErrorResponse, createApiError } from '@/types/api';

type UpdateUserRequest = {
  userName: string;
};

type UpdateUserDataResponse = {
  userId: number;
  userName: string;
};

type UpdateUserResponse = {
  code: 'SUCCESS';
  data: UpdateUserDataResponse;
  message: string;
};

async function handleApiError(response: Response, defaultMessage: string): Promise<never> {
  let errorData: ApiErrorResponse | null = null;

  try {
    const text = await response.text();
    if (text) {
      errorData = JSON.parse(text) as ApiErrorResponse;
    }
  } catch {
    // JSON 파싱 실패
  }

  if (errorData?.code) {
    throw createApiError(errorData, response.status);
  }

  const defaultCodeMap: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    500: 'INTERNAL_SERVER_ERROR',
  };

  throw new ApiError(
    defaultCodeMap[response.status] || 'UNKNOWN_ERROR',
    errorData?.message || defaultMessage,
    response.status,
  );
}

/**
 * 닉네임 수정 API
 */
export async function updateUserProfile(
  userName: string,
  accessToken: string
): Promise<UpdateUserResponse> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'PUT',
    endpoint: '/api/v1/users/me',
    body: { userName } as UpdateUserRequest,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    await handleApiError(response, '닉네임 수정에 실패했습니다.');
  }

  const data: UpdateUserResponse = await response.json();
  return data;
}
