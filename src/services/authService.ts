import serverFetchInstance from './serverFetch';
import { getRequestContext } from '@/lib/requestContext';

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

  // 백엔드는 로그인 스로틀 키로 바로 앞 프록시가 붙인 IP(req.ip)를 쓴다 — 내부 주소로 직행할 때는
  // Next 가 사용자 IP 를 넘겨야 전 사용자가 Next 서버 IP 하나를 공유하지 않는다
  const clientIp = getRequestContext()?.clientIp;
  const headers: Record<string, string> = {
    // 로그인마다 새 연결을 맺는다. Bun fetch 는 중간에서 조용히(FIN·RST 없이) 끊긴 유휴 풀 소켓을
    // 그대로 재사용해 abort 까지 멈춘다(로컬 재현: 유휴 후 요청 15s TimeoutError, 직후 새 연결 2ms).
    // Connection: close 는 Bun·Node 모두에서 이 경우를 해결함을 실측했다 — docs/tasks/kakao-login-latency-front.md
    Connection: 'close',
    ...(clientIp ? { 'X-Forwarded-For': clientIp } : {}),
  };

  try {
    const response = await serverFetchInstance.backendFetch({
      method: 'POST',
      endpoint: '/api/v1/auth/kakao',
      body: { kakaoNickname, accessToken },
      headers,
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
      // 응답 본문에 accessToken 이 들어 있을 수 있다 — 값은 남기지 않고 구조(code·키 목록)만 남긴다
      console.error('Invalid response data structure:', {
        code: response_data?.code,
        dataKeys: Object.keys(response_data?.data ?? {}),
      });
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
