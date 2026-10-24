// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LOAD_TIMEOUT_MS,
  SUBMIT_TIMEOUT_MS,
  getBattleLobbyStats,
  getBattleMatch,
  getBattleMatchList,
  getBattleReplay,
  isBattleMatchId,
  submitBattleReplay,
} from './tetrisBattleService';
import { ApiError } from '@/types/api';
import type { BattleReplayInput } from '@/app/games/tetris/battle-engine';

// 서비스 → FetchService → fetch 경로 전체를 실제로 타고, 네트워크만 stub 한다
const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const replay = { battleEngineVersion: 1, seed: 1, das: 10, arr: 2, frames: 10, inputs: [], garbage: [] } as BattleReplayInput;

describe('tetrisBattleService', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('리플레이 제출: POST /tetris-battle/matches/:matchId/replays, 본문 playerToken·replay, 비로그인은 Authorization 없이', async () => {
    fetchMock.mockResolvedValue(json({ code: 'SUCCESS', message: 'ok', data: { verdict: 'VERIFIED' } }, 201));
    const { data } = await submitBattleReplay('m 1', { playerToken: 'tok', replay });
    expect(data.verdict).toBe('VERIFIED');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/tetris-battle\/matches\/m%201\/replays$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ playerToken: 'tok', replay });
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('에러는 백엔드 code·상태 코드를 담은 ApiError로 던진다', async () => {
    fetchMock.mockResolvedValue(json({ code: 'TETRIS_BATTLE_MATCH_NOT_ENDED', message: 'x', timestamp: 't' }, 409));
    const error = await submitBattleReplay('m1', { playerToken: 'tok', replay }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'TETRIS_BATTLE_MATCH_NOT_ENDED', status: 409 });
  });

  it('경기 조회: GET /tetris-battle/matches/:matchId, 404는 TETRIS_BATTLE_MATCH_NOT_FOUND', async () => {
    fetchMock.mockResolvedValueOnce(json({ code: 'SUCCESS', message: '', data: { matchId: 'm1', players: [] } }));
    const { data } = await getBattleMatch('m1');
    expect(data.matchId).toBe('m1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/tetris-battle\/matches\/m1$/);
    expect(init.method).toBe('GET');

    fetchMock.mockResolvedValueOnce(json({ code: 'TETRIS_BATTLE_MATCH_NOT_FOUND', message: 'x', timestamp: 't' }, 404));
    const error = await getBattleMatch('m1').catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'TETRIS_BATTLE_MATCH_NOT_FOUND', status: 404 });
  });

  it('리플레이 조회: GET /tetris-battle/matches/:matchId/replays/:playerId', async () => {
    fetchMock.mockResolvedValueOnce(json({ code: 'SUCCESS', message: '', data: { ...replay, matchId: 'm1', playerId: 'p2' } }));
    const { data } = await getBattleReplay('m1', 'p2');
    expect(data.playerId).toBe('p2');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/tetris-battle\/matches\/m1\/replays\/p2$/);
  });

  it('matchId 형식 — 16자 [A-Za-z0-9_-]', () => {
    expect(isBattleMatchId('oFDKsz2Gf-rpDFBa')).toBe(true);
    expect(isBattleMatchId('oFDKsz2Gf-rpDFB')).toBe(false);
    expect(isBattleMatchId('oFDKsz2Gf.rpDFBa')).toBe(false);
  });

  it('로비 방 수: GET /tetris-battle/lobby', async () => {
    fetchMock.mockResolvedValueOnce(json({ code: 'SUCCESS', message: '', data: { waitingRooms: 2, playingRooms: 1 } }));
    const { data } = await getBattleLobbyStats();
    expect(data).toEqual({ waitingRooms: 2, playingRooms: 1 });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/tetris-battle\/lobby$/);
  });

  it('최근 경기: limit·cursor 쿼리, 첫 페이지는 cursor 없이, 잘못된 cursor는 422', async () => {
    fetchMock.mockImplementation(async () => json({ code: 'SUCCESS', message: '', data: { items: [], nextCursor: null } }));
    await getBattleMatchList({ limit: 5 });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/tetris-battle\/matches\?limit=5$/);
    await getBattleMatchList({ limit: 10, cursor: 'abc=' });
    const url = new URL(fetchMock.mock.calls[1][0], 'http://x');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('cursor')).toBe('abc=');

    fetchMock.mockResolvedValueOnce(json({ code: 'VALIDATION_ERROR', message: 'x', timestamp: 't' }, 422));
    await expect(getBattleMatchList({ cursor: 'bad' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 422 });
  });

  it('제출·조회 5종 모두 응답 대기 상한(signal)이 붙는다 — 망이 멈춰도 "저장 중"에 머물지 않는다 (games-polish FE-02)', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    fetchMock.mockImplementation(async () => json({ code: 'SUCCESS', message: '', data: { items: [], nextCursor: null } }, 201));
    await submitBattleReplay('m1', { playerToken: 'tok', replay });
    await getBattleMatch('m1');
    await getBattleReplay('m1', 'p1');
    await getBattleLobbyStats();
    await getBattleMatchList();
    expect(fetchMock).toHaveBeenCalledTimes(5);
    for (const [, init] of fetchMock.mock.calls) expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([SUBMIT_TIMEOUT_MS, LOAD_TIMEOUT_MS, LOAD_TIMEOUT_MS, LOAD_TIMEOUT_MS, LOAD_TIMEOUT_MS]);
    timeout.mockRestore();
  });

  it('제출: 401 뒤 토큰 없이 다시 낼 때도 새 상한을 붙인다', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(json({ code: 'AUTH_UNAUTHORIZED', message: 'x', timestamp: 't' }, 401))
      .mockResolvedValueOnce(json({ code: 'SUCCESS', message: 'ok', data: { verdict: 'VERIFIED' } }, 201));
    const pending = submitBattleReplay('m1', { playerToken: 'tok', replay }, 'expired');
    await vi.advanceTimersByTimeAsync(1100);
    await pending;
    vi.useRealTimers();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBeUndefined();
    expect(fetchMock.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('응답이 상한까지 없으면 NetworkError로 끝난다 (제출·조회 재시도 대상)', async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('timed out', 'TimeoutError')))),
    );
    const pending = getBattleMatch('m1').catch((err: unknown) => err);
    controller.abort();
    const err = await pending;
    timeout.mockRestore();
    expect((err as Error).name).toBe('NetworkError');
  });
});
