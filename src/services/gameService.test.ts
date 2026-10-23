// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGameSession, getGameRankings, getGameReplay, SESSION_TIMEOUT_MS, submitGameScore } from './gameService';
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

  it('세션·제출·리플레이 조회에는 응답 대기 상한(signal)이 붙는다 — 망이 멈춰도 실패 분기로 간다 (FE-08)', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ code: 'SUCCESS', message: 'ok', data: {} }, 201)));
    await createGameSession('tetris');
    await submitGameScore('tetris', { sessionId: 's', playerName: '나', replay });
    await getGameReplay('tetris', 1);
    for (const [, init] of fetchMock.mock.calls) expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('응답이 상한까지 없으면 NetworkError로 끝난다 (다시 시도 대상)', async () => {
    // 상한 타이머는 환경 내부 타이머라 직접 끊는다 — 상한 값으로 만든 신호가 끊기면 실패로 끝나는지만 본다
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('timed out', 'TimeoutError')))),
    );
    const pending = createGameSession('tetris').catch((err: unknown) => err);
    expect(timeout).toHaveBeenCalledWith(SESSION_TIMEOUT_MS);
    controller.abort();
    const err = await pending;
    timeout.mockRestore();
    expect((err as Error).name).toBe('NetworkError');
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

  it('제출: 테트리스 본문은 공용화 전과 바이트 단위로 같다 (필드 순서 포함)', async () => {
    fetchMock.mockResolvedValue(json({ code: 'SUCCESS', message: 'ok', data: {} }, 201));
    await submitGameScore('tetris', { sessionId: 's', playerName: 'n', replay });
    expect(fetchMock.mock.calls[0][1].body).toBe(
      '{"sessionId":"s","playerName":"n","replay":{"engineVersion":1,"das":10,"arr":2,"frames":100,"inputs":[0,8]}}',
    );
  });

  it('제출: 테트리스 밖 게임은 das·arr 없이, params는 있을 때만', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ code: 'SUCCESS', message: 'ok', data: {} }, 201)));
    const defenseReplay = { engineVersion: 1, frames: 30, inputs: [0, 0] };
    await submitGameScore('defense', { sessionId: 's', playerName: 'n', replay: { ...defenseReplay, das: 10 } as typeof defenseReplay });
    await submitGameScore('defense', { sessionId: 's', playerName: 'n', replay: { ...defenseReplay, params: { k: 1 } } });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/games\/defense\/scores$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).replay).toEqual(defenseReplay);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).replay).toEqual({ ...defenseReplay, params: { k: 1 } });
  });

  describe('제출: 503 GAME_VERIFY_BUSY는 같은 세션으로 1회 자동 재시도', () => {
    const busy = (headers: Record<string, string> = {}) =>
      new Response(JSON.stringify({ code: 'GAME_VERIFY_BUSY', message: '밀림', timestamp: 't' }), { status: 503, headers });

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('Retry-After(초)만큼 기다렸다 다시 내고, 성공하면 결과를 돌려준다', async () => {
      fetchMock.mockResolvedValueOnce(busy({ 'Retry-After': '3' })).mockResolvedValueOnce(json({ code: 'SUCCESS', message: 'ok', data: { scoreId: 9 } }, 201));
      const pending = submitGameScore('tetris', { sessionId: 's', playerName: 'n', replay });
      await vi.advanceTimersByTimeAsync(2999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      const { data } = await pending;
      expect(data.scoreId).toBe(9);
      expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
    });

    it('Retry-After가 없으면 2초, 두 번째도 BUSY면 그 에러를 던진다 (호출부가 retry로 보관)', async () => {
      fetchMock.mockResolvedValueOnce(busy()).mockResolvedValueOnce(busy());
      const pending = submitGameScore('tetris', { sessionId: 's', playerName: 'n', replay }).catch((e) => e);
      await vi.advanceTimersByTimeAsync(1999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      const err = await pending;
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(err).toBeInstanceOf(ApiError);
      expect(err).toMatchObject({ code: 'GAME_VERIFY_BUSY', status: 503 });
    });

    it('Retry-After가 10초를 넘거나 다른 503이면 자동 재시도하지 않는다', async () => {
      fetchMock.mockResolvedValueOnce(busy({ 'Retry-After': '30' }));
      await expect(submitGameScore('tetris', { sessionId: 's', playerName: 'n', replay })).rejects.toMatchObject({ code: 'GAME_VERIFY_BUSY' });
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
      await expect(submitGameScore('tetris', { sessionId: 's', playerName: 'n', replay })).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('Retry-After 0도 제출 스로틀 창(1.1초)보다 먼저 다시 내지 않는다', async () => {
      fetchMock.mockResolvedValueOnce(busy({ 'Retry-After': '0' })).mockResolvedValueOnce(json({ code: 'SUCCESS', message: 'ok', data: {} }, 201));
      const pending = submitGameScore('tetris', { sessionId: 's', playerName: 'n', replay });
      await vi.advanceTimersByTimeAsync(1099);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('정수 초가 아닌 Retry-After(소수·음수·HTTP 날짜)는 기본 2초, 정확히 10초는 재시도한다', async () => {
      const success = () => json({ code: 'SUCCESS', message: 'ok', data: {} }, 201);
      for (const [header, waitMs] of [
        ['1.5', 2000],
        ['-1', 2000],
        ['Wed, 21 Oct 2026 07:28:00 GMT', 2000],
        ['10', 10_000],
      ] as const) {
        fetchMock.mockReset();
        fetchMock.mockResolvedValueOnce(busy({ 'Retry-After': header })).mockResolvedValueOnce(success());
        const pending = submitGameScore('tetris', { sessionId: 's', playerName: 'n', replay });
        await vi.advanceTimersByTimeAsync(waitMs - 1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        await pending;
        expect(fetchMock).toHaveBeenCalledTimes(2);
      }
    });
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
    fetchMock.mockImplementation(() => Promise.resolve(json({ code: 'SUCCESS', message: 'ok', data: { items: [], periodStart: null } })));
    await getGameRankings('tetris', 'weekly', 50);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/games\/tetris\/rankings\?period=weekly&limit=50$/);
    // 보드를 지정하면 뒤에 붙는다 (생략·빈 문자열이면 위처럼 공용화 전 URL 그대로)
    await getGameRankings('defense', 'all', 10, 'endless-s1');
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/api\/v1\/games\/defense\/rankings\?period=all&limit=10&board=endless-s1$/);
    await getGameRankings('tetris', 'weekly', 50, '');
    expect(fetchMock.mock.calls[2][0]).toBe(fetchMock.mock.calls[0][0]);

    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(getGameReplay('tetris', 7)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    expect(fetchMock.mock.calls[3][0]).toMatch(/\/api\/v1\/games\/tetris\/scores\/7\/replay$/);
  });
});
