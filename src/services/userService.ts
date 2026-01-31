import fetchServiceInstance from './FetchService';

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
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || '닉네임 수정에 실패했습니다.');
  }

  const data: UpdateUserResponse = await response.json();
  return data;
}
