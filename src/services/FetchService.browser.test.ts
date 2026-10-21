// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FetchClient } from './FetchService';
import { NetworkError, NETWORK_ERROR_MESSAGE } from '@/types/api';

// 브라우저 전용 분기: 401 전역 이벤트, 쿠키 헤더 미부착
describe('FetchClient (브라우저)', () => {
  const fetchMock = vi.fn();
  const onUnauthorized = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    onUnauthorized.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    window.addEventListener('backend:unauthorized', onUnauthorized);
  });

  afterEach(() => {
    window.removeEventListener('backend:unauthorized', onUnauthorized);
    vi.unstubAllGlobals();
  });

  it('인증 헤더를 붙인 요청이 401이면 backend:unauthorized 를 1회 발행한다', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await new FetchClient('http://x').fetch('/t', { accessToken: 'tok' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('직접 넣은 authorization 헤더(소문자)도 인증 요청으로 본다', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await new FetchClient('http://x').fetch('/t', { headers: { authorization: 'Bearer tok' } });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('인증 헤더 없는 요청의 401은 이벤트를 발행하지 않는다', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await new FetchClient('http://x').fetch('/t');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('notifyUnauthorized: false면 401이어도 이벤트를 발행하지 않는다 (호출부가 직접 처리)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await new FetchClient('http://x').fetch('/t', { accessToken: 'tok', notifyUnauthorized: false });
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('notifyUnauthorized');
  });

  it('401이 아닌 실패(403)는 이벤트를 발행하지 않는다', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
    await new FetchClient('http://x').fetch('/t', { accessToken: 'tok' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('throwOnError여도 이벤트를 먼저 발행한 뒤 던진다', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(
      new FetchClient('http://x').fetch('/t', { accessToken: 'tok', throwOnError: true }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('fetch 자체가 실패하면(TypeError) 한국어 안내를 가진 NetworkError로 바꿔 던진다', async () => {
    const cause = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValue(cause);
    const err = await new FetchClient('http://x').fetch('/t').catch(e => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect(err).toMatchObject({ message: NETWORK_ERROR_MESSAGE, cause });
  });

  it('요청 취소(AbortError)는 NetworkError로 바꾸지 않는다', async () => {
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    const err = await new FetchClient('http://x').fetch('/t').catch(e => e);
    expect(err).not.toBeInstanceOf(NetworkError);
    expect(err.name).toBe('AbortError');
  });

  it('브라우저에서는 cookies 옵션을 Cookie 헤더로 붙이지 않는다', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    await new FetchClient('http://x').fetch('/t', { cookies: 'a=1' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Cookie).toBeUndefined();
  });
});
