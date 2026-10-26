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

// ==================== 스킨 (테트리스 D-003) ====================

/** 카탈로그 아이템 — 서버가 SSOT(id·획득 방식·보유). unlock은 'default'·'free' 외에 업적·출석 등이 늘어난다 */
export type SkinCatalogItem = { id: string; owned: boolean; unlock: string };

export type SkinSlotName = 'block' | 'effect' | 'board' | 'background';

export type UserSkins = {
  equipped: Record<SkinSlotName, string>;
  catalog: Record<SkinSlotName, SkinCatalogItem[]>;
};

type UserSkinsResponse = {
  code: 'SUCCESS';
  data: UserSkins;
  message: string;
};

/**
 * 내 장착·카탈로그 — 게임 화면 진입마다 부르므로 만료 토큰 401로 전역 로그아웃(로그인 화면 이동)을 일으키지 않는다
 * 호출부(mySkins)가 401을 "로그인 만료"로 받아 기본 스킨으로 그린다 — 게임 기록 401 정책과 같다(판·결과를 잃지 않게)
 */
export async function getMySkins(accessToken: string): Promise<UserSkinsResponse> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: '/api/v1/users/me/skins',
    accessToken,
    notifyUnauthorized: false,
  });

  if (!response.ok) {
    await handleApiError(response, '스킨 정보를 불러오지 못했습니다.');
  }

  return response.json();
}

/**
 * 장착 변경 — 바꿀 슬롯만 보낸다. 카탈로그 밖 422 USER_SKIN_UNKNOWN · 미보유 403 USER_SKIN_NOT_OWNED
 * 401(만료)도 전역 로그아웃 없이 던진다 — 장착 모달·도감이 롤백하고 다시 로그인하라고 안내한다
 */
export async function updateMySkins(changes: Partial<Record<SkinSlotName, string>>, accessToken: string): Promise<UserSkinsResponse> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'PUT',
    endpoint: '/api/v1/users/me/skins',
    body: changes,
    accessToken,
    notifyUnauthorized: false,
  });

  if (!response.ok) {
    await handleApiError(response, '스킨을 바꾸지 못했습니다.');
  }

  return response.json();
}
