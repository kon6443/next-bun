import fetchServiceInstance from './FetchService';

type KakaoSignInUpRequest = {
  kakaoNickname: string;
  accessToken: string;
};

type KakaoSignInUpDataResponse = {
  userId: number;
  userName: string;
  loginType: 'KAKAO';
  accessToken: string;
  tokenType: string;
};

type KakaoSignInUpResponse = {
  code: 'SUCCESS';
  data: KakaoSignInUpDataResponse;
  message: string;
};

/**
 * API 응답에서 에러 메시지 추출
 */
async function extractErrorMessage(response: Response, defaultMessage: string): Promise<string> {
  try {
    const errorData = await response.text();
    if (errorData) {
      try {
        const parsedError = JSON.parse(errorData);
        // NestJS validation 에러는 message가 배열일 수 있음
        if (Array.isArray(parsedError.message)) {
          return parsedError.message.join(', ');
        }
        return parsedError.message || parsedError.error || defaultMessage;
      } catch {
        return errorData || defaultMessage;
      }
    }
  } catch {
    // 응답 본문 읽기 실패
  }
  return defaultMessage;
}

/**
 * 카카오 로그인/회원가입
 */
export async function postKakaoSignInUp({
  kakaoNickname,
  accessToken,
}: KakaoSignInUpRequest): Promise<KakaoSignInUpResponse> {
  // AbortController를 사용하여 timeout 설정
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃

  try {
    const response = await fetchServiceInstance.backendFetch({
      method: 'POST',
      endpoint: '/api/v1/auth/kakao',
      body: { kakaoNickname, accessToken },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorMessage = await extractErrorMessage(response, 'LOGIN FAILED');
      throw new Error(`LOGIN FAILED: ${response.status} ${response.statusText} - ${errorMessage}`);
    }

    // Content-Type 확인
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      await response.text(); // 응답 본문 소비 (메모리 누수 방지)
      throw new Error('서버가 예상하지 못한 형식으로 응답했습니다.');
    }

    const response_data: KakaoSignInUpResponse = await response.json();

    // 응답 데이터 검증 (새로운 표준 응답 형식: { code, data, message })
    if (
      !response_data ||
      response_data.code !== 'SUCCESS' ||
      !response_data.data ||
      typeof response_data.data.userId !== 'number' ||
      typeof response_data.data.userName !== 'string' ||
      !response_data.data.loginType ||
      typeof response_data.data.accessToken !== 'string' ||
      !response_data.data.accessToken ||
      typeof response_data.data.tokenType !== 'string' ||
      !response_data.data.tokenType
    ) {
      console.error('Invalid response data structure:', response_data);
      throw new Error('서버 응답 형식이 올바르지 않습니다.');
    }

    return response_data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
    }
    throw error;
  }
}
