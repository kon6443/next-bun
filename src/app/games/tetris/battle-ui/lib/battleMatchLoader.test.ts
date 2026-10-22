import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@/types/api';

const getBattleMatch = vi.fn();
const getBattleReplay = vi.fn();
vi.mock('@/services/tetrisBattleService', () => ({
  getBattleMatch: (...a: unknown[]) => getBattleMatch(...a),
  getBattleReplay: (...a: unknown[]) => getBattleReplay(...a),
}));

import { clearBattleMatchCache, loadBattleMatch, loadBattleReplay } from './battleMatchLoader';

const noSleep = () => Promise.resolve();

describe('battleMatchLoader — 같은 조회는 함께 쓴다', () => {
  beforeEach(() => {
    getBattleMatch.mockReset();
    getBattleReplay.mockReset();
    clearBattleMatchCache();
  });

  it('경기: 진행 중인 요청만 함께 쓰고, 끝나면 다음 조회는 새로 묻는다(저장 대기 폴링)', async () => {
    getBattleMatch.mockResolvedValue({ data: { matchId: 'm' } });
    const [a, b] = [loadBattleMatch('m'), loadBattleMatch('m')];
    expect(a).toBe(b);
    await a;
    await loadBattleMatch('m');
    expect(getBattleMatch).toHaveBeenCalledTimes(2);
  });

  it('리플레이: 받아 둔 것을 재사용', async () => {
    getBattleReplay.mockResolvedValue({ data: { playerId: 'p1' } });
    await loadBattleReplay('m', 'p1', noSleep);
    await loadBattleReplay('m', 'p1', noSleep);
    expect(getBattleReplay).toHaveBeenCalledTimes(1);
  });

  it('리플레이: 429·5xx·네트워크 오류는 두 번까지 다시, 404는 바로 실패하고 캐시하지 않는다', async () => {
    getBattleReplay
      .mockRejectedValueOnce(new ApiError('TOO_MANY_REQUESTS', 'x', 429))
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce({ data: { playerId: 'p1' } });
    await expect(loadBattleReplay('m', 'p1', noSleep)).resolves.toEqual({ playerId: 'p1' });
    expect(getBattleReplay).toHaveBeenCalledTimes(3);

    getBattleReplay.mockReset().mockRejectedValue(new ApiError('TETRIS_BATTLE_REPLAY_NOT_FOUND', 'x', 404));
    await expect(loadBattleReplay('m', 'p2', noSleep)).rejects.toMatchObject({ status: 404 });
    await expect(loadBattleReplay('m', 'p2', noSleep)).rejects.toMatchObject({ status: 404 });
    expect(getBattleReplay).toHaveBeenCalledTimes(2);
  });

  it('리플레이: 재시도를 다 쓰면 실패', async () => {
    getBattleReplay.mockRejectedValue(new ApiError('INTERNAL_SERVER_ERROR', 'x', 500));
    await expect(loadBattleReplay('m', 'p1', noSleep)).rejects.toMatchObject({ status: 500 });
    expect(getBattleReplay).toHaveBeenCalledTimes(3);
  });
});
