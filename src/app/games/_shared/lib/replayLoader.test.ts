import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearReplayCache, loadReplay } from './replayLoader';

const getGameReplay = vi.fn();
vi.mock('@/services/gameService', () => ({
  getGameReplay: (...args: unknown[]) => getGameReplay(...args),
}));

const response = (scoreId: number) => ({ code: 'SUCCESS', message: 'ok', data: { scoreId } });

describe('loadReplay — 같은 기록 중복 조회 방지 (리플레이 스로틀 초당 2)', () => {
  beforeEach(() => {
    getGameReplay.mockReset();
    clearReplayCache();
  });

  it('진행 중이거나 받아 둔 요청을 함께 쓴다 (재마운트·StrictMode)', async () => {
    getGameReplay.mockResolvedValue(response(6));
    const [a, b] = await Promise.all([loadReplay('tetris', 6), loadReplay('tetris', 6)]);
    const c = await loadReplay('tetris', 6);
    expect(getGameReplay).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(c).toBe(a);
  });

  it('실패는 캐시하지 않는다 — 다시 들어오면 새로 부른다', async () => {
    getGameReplay.mockRejectedValueOnce(new Error('429')).mockResolvedValueOnce(response(7));
    await expect(loadReplay('tetris', 7)).rejects.toThrow('429');
    await expect(loadReplay('tetris', 7)).resolves.toEqual({ scoreId: 7 });
    expect(getGameReplay).toHaveBeenCalledTimes(2);
  });

  it('게임이 다르면 같은 id라도 따로 부른다', async () => {
    getGameReplay.mockImplementation((_type: string, id: number) => Promise.resolve(response(id)));
    await loadReplay('tetris', 5);
    await loadReplay('defense', 5);
    expect(getGameReplay.mock.calls).toEqual([
      ['tetris', 5],
      ['defense', 5],
    ]);
  });

  it('최근 3개만 보관', async () => {
    getGameReplay.mockImplementation((_type: string, id: number) => Promise.resolve(response(id)));
    for (const id of [1, 2, 3, 4]) await loadReplay('tetris', id);
    await loadReplay('tetris', 1); // 밀려난 기록은 다시 부른다
    expect(getGameReplay).toHaveBeenCalledTimes(5);
  });
});
