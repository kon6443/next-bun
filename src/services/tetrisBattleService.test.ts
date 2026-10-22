// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { submitBattleReplay } from './tetrisBattleService';
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
});
