// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMySkins, updateMySkins } from './userService';

// 서비스 → FetchService → fetch 경로 전체를 실제로 타고, 네트워크만 stub 한다
const fetchMock = vi.fn();
const onUnauthorized = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const expired = () => json({ code: 'AUTH_UNAUTHORIZED', message: '만료', timestamp: 't' }, 401);

describe('userService 스킨 (D-003)', () => {
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

  it('내 장착 조회: Bearer로 부르고, 만료 401이어도 전역 로그아웃을 일으키지 않고 401을 던진다 — 게임 화면 진입마다 부르므로', async () => {
    fetchMock.mockResolvedValue(expired());
    await expect(getMySkins('old')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer old');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('장착 변경: 바꾼 슬롯만 보내고, 만료 401이어도 전역 로그아웃 없이 던진다', async () => {
    fetchMock.mockResolvedValue(expired());
    await expect(updateMySkins({ block: 'neon' }, 'old')).rejects.toMatchObject({ status: 401 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/users\/me\/skins$/);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ block: 'neon' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
