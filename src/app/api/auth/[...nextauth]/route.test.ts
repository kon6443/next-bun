import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

// vi.mock 은 파일 맨 위로 끌어올려지므로 그 안에서 쓰는 값도 hoisted 로 만든다
const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock('next-auth', () => ({ default: () => handlerMock }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

import { GET } from './route';
import { getRequestContext } from '@/lib/requestContext';

const ctx = { params: Promise.resolve({ nextauth: ['callback', 'kakao'] }) };
const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });

let logSpy: MockInstance<typeof console.log>;
const loggedLines = () => logSpy.mock.calls.map(args => JSON.parse(String(args[0])));

beforeEach(() => {
  handlerMock.mockReset();
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => logSpy.mockRestore());

describe('NextAuth route 래퍼', () => {
  it('카카오 콜백만 소요를 1줄 남긴다 — 다른 경로는 남기지 않는다', async () => {
    handlerMock.mockResolvedValue(new Response('{}'));
    await GET(new Request('http://localhost/api/auth/providers'), ctx);
    await GET(new Request('http://localhost/api/auth/session'), ctx);
    expect(logSpy).not.toHaveBeenCalled();

    handlerMock.mockResolvedValue(redirect('http://localhost/mypage'));
    await GET(new Request('http://localhost/api/auth/callback/kakao?code=secret-code&state=s'), ctx);
    const lines = loggedLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 'info', tag: 'login.callback' });
    expect(typeof lines[0].ms).toBe('number');
    expect(typeof lines[0].time).toBe('string');
    // 쿼리(인가 코드)·IP 는 남기지 않는다
    expect(JSON.stringify(lines[0])).not.toContain('secret-code');
  });

  it('에러 페이지로 보내는 Location 이면 실패로 남긴다', async () => {
    handlerMock.mockResolvedValue(redirect('http://localhost/auth/error?error=OAuthCallback'));
    await GET(new Request('http://localhost/api/auth/callback/kakao?code=c'), ctx);
    expect(loggedLines()[0]).toMatchObject({ level: 'error', tag: 'login.callback.error' });
  });

  it('로그인 페이지 + error 쿼리면 실패, 성공 후 이동할 주소의 error 쿼리는 성공으로 남긴다', async () => {
    handlerMock.mockResolvedValue(redirect('http://localhost/auth/signin?error=OAuthAccountNotLinked'));
    await GET(new Request('http://localhost/api/auth/callback/kakao?code=c'), ctx);
    handlerMock.mockResolvedValue(redirect('http://localhost/teams?error=stale'));
    await GET(new Request('http://localhost/api/auth/callback/kakao?code=c'), ctx);
    expect(loggedLines().map(line => line.tag)).toEqual(['login.callback.error', 'login.callback']);
  });

  it('Location 을 해석할 수 없어도 응답은 그대로 돌려주고 실패로 남긴다', async () => {
    const response = redirect('http://[');
    handlerMock.mockResolvedValue(response);
    await expect(GET(new Request('http://localhost/api/auth/callback/kakao?code=c'), ctx)).resolves.toBe(response);
    expect(loggedLines()[0]).toMatchObject({ level: 'error', tag: 'login.callback.error' });
  });

  it('핸들러가 예외를 던져도 실패 로그를 남기고 예외는 그대로 던진다', async () => {
    handlerMock.mockRejectedValue(new Error('boom'));
    await expect(GET(new Request('http://localhost/api/auth/callback/kakao?code=c'), ctx)).rejects.toThrow('boom');
    expect(loggedLines()[0]).toMatchObject({ level: 'error', tag: 'login.callback.error' });
  });

  it('핸들러 안에서 요청 컨텍스트(사용자 IP)를 꺼낼 수 있다', async () => {
    let seen: string | undefined;
    handlerMock.mockImplementation(async () => {
      seen = getRequestContext()?.clientIp;
      return new Response('{}');
    });
    await GET(new Request('http://localhost/api/auth/session', { headers: { 'x-forwarded-for': '10.0.0.1, 203.0.113.9' } }), ctx);
    expect(seen).toBe('203.0.113.9');
  });
});
