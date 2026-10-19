import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const okBody = {
  code: 'SUCCESS',
  message: '',
  data: { userId: 1, userName: '홍길동', loginType: 'KAKAO', accessToken: 'jwt', tokenType: 'Bearer' },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('SERVER_API_BASE', 'http://internal.test:3500');
  fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(okBody), { status: 201, headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// resetModules 뒤에는 authService 와 같은 모듈 인스턴스의 컨텍스트를 써야 한다
const load = async () => ({
  ...(await import('./authService')),
  ...(await import('@/lib/requestContext')),
});

const lastRequest = () => {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
  return { url, headers: init.headers };
};

describe('postKakaoSignInUp', () => {
  it('서버 전용 주소로 보내고, 매번 새 연결(Connection: close)을 쓴다', async () => {
    const { postKakaoSignInUp } = await load();
    await postKakaoSignInUp({ accessToken: 'kakao-token', kakaoNickname: '닉' });
    const { url, headers } = lastRequest();
    expect(url).toBe('http://internal.test:3500/api/v1/auth/kakao');
    expect(headers.Connection).toBe('close');
  });

  it('요청 컨텍스트에 사용자 IP 가 있으면 X-Forwarded-For 로 넘긴다', async () => {
    const { postKakaoSignInUp, runWithRequestContext } = await load();
    await runWithRequestContext({ clientIp: '203.0.113.5' }, () =>
      postKakaoSignInUp({ accessToken: 'kakao-token', kakaoNickname: '닉' }),
    );
    expect(lastRequest().headers['X-Forwarded-For']).toBe('203.0.113.5');
  });

  it('사용자 IP 가 없으면 X-Forwarded-For 를 붙이지 않는다', async () => {
    const { postKakaoSignInUp, runWithRequestContext } = await load();
    await runWithRequestContext({}, () => postKakaoSignInUp({ accessToken: 'kakao-token', kakaoNickname: '닉' }));
    expect(lastRequest().headers).not.toHaveProperty('X-Forwarded-For');
  });

  it('응답 형식이 틀려 실패해도 로그에 토큰 값을 남기지 않는다', async () => {
    const leakedToken = 'backend-jwt-must-not-be-logged';
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 'SUCCESS', data: { ...okBody.data, accessToken: leakedToken, tokenType: '' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { postKakaoSignInUp } = await load();
    await expect(postKakaoSignInUp({ accessToken: 'kakao-token', kakaoNickname: '닉' })).rejects.toThrow(
      '서버 응답 형식이 올바르지 않습니다.',
    );
    expect(errorSpy).toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(leakedToken);
    errorSpy.mockRestore();
  });
});
