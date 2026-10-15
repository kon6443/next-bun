import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FetchClient } from './FetchService';
import { ApiError } from '@/types/api';

const fetchMock = vi.fn();

function lastCall(): { url: string; init: RequestInit & { headers: Record<string, string> } } {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url, init };
}

describe('FetchClient', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('URL 병합', () => {
    it.each([
      ['http://x', '/api/v1/teams'],
      ['http://x/', '/api/v1/teams'],
      ['http://x', 'api/v1/teams'],
      ['http://x/', 'api/v1/teams'],
    ])('base "%s" + endpoint "%s" → 슬래시 하나로 합친다', async (base, endpoint) => {
      await new FetchClient(base).fetch(endpoint);
      expect(lastCall().url).toBe('http://x/api/v1/teams');
    });

    it('절대 URL endpoint는 base를 무시한다', async () => {
      await new FetchClient('http://x').fetch('https://other.example/a');
      expect(lastCall().url).toBe('https://other.example/a');
    });

    it('base가 비어 있으면 endpoint 그대로', async () => {
      await new FetchClient('').fetch('/api/v1/teams');
      expect(lastCall().url).toBe('/api/v1/teams');
    });
  });

  describe('backendFetch 쿼리 파라미터', () => {
    it('null·undefined는 빼고 배열은 같은 키로 반복한다', async () => {
      await new FetchClient('http://x').backendFetch({
        method: 'GET',
        endpoint: '/t',
        query: { a: 1, b: undefined, c: null, d: ['x', null, 'y'], e: false },
      });
      expect(lastCall().url).toBe('http://x/t?a=1&d=x&d=y&e=false');
    });

    it('endpoint에 이미 ?가 있으면 &로 잇는다', async () => {
      await new FetchClient('http://x').backendFetch({ method: 'GET', endpoint: '/t?status=1', query: { limit: 10 } });
      expect(lastCall().url).toBe('http://x/t?status=1&limit=10');
    });

    it('모든 값이 비면 ?를 붙이지 않는다', async () => {
      await new FetchClient('http://x').backendFetch({ method: 'GET', endpoint: '/t', query: { a: undefined } });
      expect(lastCall().url).toBe('http://x/t');
    });

    it('값은 URL 인코딩된다', async () => {
      await new FetchClient('http://x').backendFetch({ method: 'GET', endpoint: '/t', query: { q: 'a b&c' } });
      expect(lastCall().url).toBe('http://x/t?q=a+b%26c');
    });
  });

  describe('본문·헤더', () => {
    it('객체 body는 JSON 문자열로 보내고 Content-Type을 붙인다', async () => {
      await new FetchClient('http://x').backendFetch({ method: 'POST', endpoint: '/t', body: { a: 1 } });
      const { init } = lastCall();
      expect(init.method).toBe('POST');
      expect(init.body).toBe('{"a":1}');
      expect(init.headers['Content-Type']).toBe('application/json');
    });

    it('FormData body에는 Content-Type을 붙이지 않는다 (브라우저가 boundary 지정)', async () => {
      const fd = new FormData();
      fd.append('f', 'v');
      await new FetchClient('http://x').backendFetch({ method: 'POST', endpoint: '/t', body: fd });
      const { init } = lastCall();
      expect(init.body).toBe(fd);
      expect(init.headers['Content-Type']).toBeUndefined();
    });

    it('body가 없으면 Content-Type 없이 Accept만', async () => {
      await new FetchClient('http://x').backendFetch({ method: 'GET', endpoint: '/t' });
      const { init } = lastCall();
      expect(init.body).toBeUndefined();
      expect(init.headers.Accept).toBe('application/json');
      expect(init.headers['Content-Type']).toBeUndefined();
    });

    it('credentials 기본값은 same-origin', async () => {
      await new FetchClient('http://x').fetch('/t');
      expect(lastCall().init.credentials).toBe('same-origin');
    });
  });

  describe('accessToken → Authorization', () => {
    it('accessToken만 주면 Bearer로 붙인다', async () => {
      await new FetchClient('http://x').backendFetch({ method: 'GET', endpoint: '/t', accessToken: 'tok' });
      expect(lastCall().init.headers.Authorization).toBe('Bearer tok');
    });

    it('tokenType을 주면 그 타입을 쓴다', async () => {
      await new FetchClient('http://x').fetch('/t', { accessToken: 'tok', tokenType: 'Token' });
      expect(lastCall().init.headers.Authorization).toBe('Token tok');
    });

    it('명시한 Authorization 헤더(대소문자 무관)를 덮어쓰지 않는다', async () => {
      await new FetchClient('http://x').fetch('/t', { accessToken: 'tok', headers: { authorization: 'Basic abc' } });
      const { headers } = lastCall().init;
      expect(headers.authorization).toBe('Basic abc');
      expect(headers.Authorization).toBeUndefined();
    });

    it('accessToken이 빈 문자열이면 Authorization을 붙이지 않는다', async () => {
      await new FetchClient('http://x').fetch('/t', { accessToken: '' });
      expect(lastCall().init.headers.Authorization).toBeUndefined();
    });

    it('accessToken·tokenType은 fetch init에 새지 않는다', async () => {
      await new FetchClient('http://x').fetch('/t', { accessToken: 'tok', throwOnError: true });
      const { init } = lastCall();
      expect(init).not.toHaveProperty('accessToken');
      expect(init).not.toHaveProperty('throwOnError');
    });
  });

  describe('쿠키 (서버 환경)', () => {
    it('객체 쿠키는 빈 값을 빼고 직렬화해 Cookie 헤더로 보낸다', async () => {
      await new FetchClient('http://x').fetch('/t', { cookies: { a: '1', b: '', c: '3' } });
      expect(lastCall().init.headers.Cookie).toBe('a=1; c=3');
    });
  });

  describe('렌더링 모드', () => {
    it('ssr은 no-store, ssg는 force-cache', async () => {
      const client = new FetchClient('http://x');
      await client.ssr('/t');
      expect(lastCall().init.cache).toBe('no-store');
      await client.ssg('/t');
      expect(lastCall().init.cache).toBe('force-cache');
    });

    it('isr은 time을 revalidate로 쓰되 options.next.revalidate가 우선', async () => {
      const client = new FetchClient('http://x');
      await client.isr('/t', 60);
      expect((lastCall().init as { next?: { revalidate?: number } }).next?.revalidate).toBe(60);
      await client.isr('/t', 60, { next: { revalidate: 0, tags: ['a'] } });
      expect((lastCall().init as { next?: unknown }).next).toEqual({ revalidate: 0, tags: ['a'] });
    });
  });

  describe('throwOnError', () => {
    it('기본값(false)이면 실패 응답도 그대로 반환한다', async () => {
      fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
      const res = await new FetchClient('http://x').fetch('/t');
      expect(res.status).toBe(500);
    });

    it('백엔드 code·message가 있으면 그대로 ApiError로 던진다', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ code: 'TEAM_NOT_FOUND', message: '팀 없음', timestamp: 't' }), { status: 404 }),
      );
      const err = await new FetchClient('http://x').fetch('/t', { throwOnError: true }).catch(e => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err).toMatchObject({ code: 'TEAM_NOT_FOUND', message: '팀 없음', status: 404 });
    });

    it('code가 없으면 상태 코드 기반 code + 본문 message', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: '잘못됨' }), { status: 422 }));
      const err = await new FetchClient('http://x').fetch('/t', { throwOnError: true }).catch(e => e);
      expect(err).toMatchObject({ code: 'VALIDATION_ERROR', message: '잘못됨', status: 422 });
    });

    it('본문이 JSON이 아니면 기본 메시지, 매핑 없는 상태는 UNKNOWN_ERROR', async () => {
      fetchMock.mockResolvedValue(new Response('<html>oops</html>', { status: 418 }));
      const err = await new FetchClient('http://x').fetch('/t', { throwOnError: true }).catch(e => e);
      expect(err).toMatchObject({ code: 'UNKNOWN_ERROR', message: '요청 처리 중 오류가 발생했습니다.', status: 418 });
    });

    it('본문이 비어 있어도 상태 코드로 판정한다', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
      const err = await new FetchClient('http://x').fetch('/t', { throwOnError: true }).catch(e => e);
      expect(err).toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 503 });
    });

    it('성공 응답이면 던지지 않는다', async () => {
      const res = await new FetchClient('http://x').fetch('/t', { throwOnError: true });
      expect(res.ok).toBe(true);
    });
  });

  it('node 환경(window 없음)에서는 401이어도 이벤트 없이 응답을 반환한다', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const res = await new FetchClient('http://x').fetch('/t', { accessToken: 'tok' });
    expect(res.status).toBe(401);
  });
});
