// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGameSession, getGameRankings, getGameReplay, submitGameScore } from './gameService';
import { ApiError } from '@/types/api';

// 서비스 → FetchService → fetch 경로 전체를 실제로 타고, 네트워크만 stub 한다 (백엔드 API 준비 전 mock)
const fetchMock = vi.fn();
const onUnauthorized = vi.fn();

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const replay = { engineVersion: 1, das: 10, arr: 2, frames: 100, inputs: [0, 8] };

describe('gameService', () => {
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

  it('세션: 비로그인은 Authorization 없이', async () => {
    fetchMock.mockResolvedValue(json({ code: 'SUCCESS', message: 'ok', data: { sessionId: 's', seed: 1, engineVersion: 1, expiresAt: 'x' } }, 201));
    await createGameSession('tetris');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/games\/tetris\/sessions$/);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('세션: 만료 토큰이라 401이면 전역 로그아웃 없이, 스로틀 창(1.1초)을 피해 토큰 없이 1회 재시도', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(json({ code: 'AUTH_UNAUTHORIZED', message: 'x', timestamp: 't' }, 401))
      .mockResolvedValueOnce(json({ code: 'SUCCESS', message: 'ok', data: { sessionId: 's' } }, 201));
    const pending = createGameSession('tetris', 'expired');
    await vi.advanceTimersByTimeAsync(1099);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const { data } = await pending;
    vi.useRealTimers();
    expect(data.sessionId).toBe('s');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer expired');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBeUndefined();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('제출: DTO 필드만 (점수·여분 필드 없음)', async () => {
    fetchMock.mockResolvedValue(json({ code: 'SUCCESS', message: 'ok', data: {} }, 201));
    await submitGameScore(
      'tetris',
      { sessionId: 's', playerName: 'n', replay: { ...replay, score: 999 } as typeof replay },
      'tok',
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/games\/tetris\/scores$/);
    expect(JSON.parse(init.body)).toEqual({ sessionId: 's', playerName: 'n', replay });
  });

  it('제출: 금칙어 422는 코드 그대로', async () => {
    fetchMock.mockResolvedValue(json({ code: 'GAME_PLAYER_NAME_FORBIDDEN', message: '금칙어', timestamp: 't' }, 422));
    const err = await submitGameScore('tetris', { sessionId: 's', playerName: 'n', replay }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'GAME_PLAYER_NAME_FORBIDDEN', status: 422 });
  });

  it('제출: 본문 없는 413·429는 상태 기반 코드', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 413 }));
    await expect(submitGameScore('tetris', { sessionId: 's', playerName: 'n', replay })).rejects.toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
    });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 429 }));
    await expect(submitGameScore('tetris', { sessionId: 's', playerName: 'n', replay })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
  });

  it('랭킹·리플레이 경로', async () => {
    fetchMock.mockResolvedValue(json({ code: 'SUCCESS', message: 'ok', data: { items: [], periodStart: null } }));
    await getGameRankings('tetris', 'weekly', 50);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/games\/tetris\/rankings\?period=weekly&limit=50$/);

    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(getGameReplay('tetris', 7)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/api\/v1\/games\/tetris\/scores\/7\/replay$/);
  });
});
