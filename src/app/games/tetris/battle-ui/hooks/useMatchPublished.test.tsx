// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ApiError } from '@/types/api';

const getBattleMatch = vi.fn();
vi.mock('@/services/tetrisBattleService', () => ({ getBattleMatch: (...a: unknown[]) => getBattleMatch(...a) }));

import { PUBLISH_POLL_LIMIT_MS, PUBLISH_POLL_MS, useMatchPublished } from './useMatchPublished';
import { clearBattleMatchCache } from '../lib/battleMatchLoader';

const notFound = () => new ApiError('TETRIS_BATTLE_MATCH_NOT_FOUND', 'x', 404);
const flush = () => act(async () => {});

describe('useMatchPublished — 경기 저장까지 GET으로 대기', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getBattleMatch.mockReset();
    clearBattleMatchCache();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('404(저장 전)면 간격을 두고 다시 묻고, 200이면 멈춘다', async () => {
    getBattleMatch.mockRejectedValueOnce(notFound()).mockResolvedValueOnce({ data: { matchId: 'm' } });
    const { result } = renderHook(() => useMatchPublished('m'));
    await flush();
    expect(result.current.status).toBe('waiting');
    expect(getBattleMatch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUBLISH_POLL_MS);
    });
    expect(result.current).toEqual({ status: 'ready', match: { matchId: 'm' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUBLISH_POLL_MS * 3);
    });
    expect(getBattleMatch).toHaveBeenCalledTimes(2);
  });

  it('한도까지 404면 unavailable — 한도 안의 조회 횟수만', async () => {
    getBattleMatch.mockRejectedValue(notFound());
    const { result } = renderHook(() => useMatchPublished('m'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUBLISH_POLL_LIMIT_MS + PUBLISH_POLL_MS);
    });
    expect(result.current.status).toBe('unavailable');
    expect(getBattleMatch.mock.calls.length).toBeLessThanOrEqual(Math.ceil(PUBLISH_POLL_LIMIT_MS / PUBLISH_POLL_MS));
  });

  it('다시 보내도 안 되는 실패(422 등)는 바로 unavailable', async () => {
    getBattleMatch.mockRejectedValue(new ApiError('VALIDATION_ERROR', 'x', 422));
    const { result } = renderHook(() => useMatchPublished('m'));
    await flush();
    expect(result.current.status).toBe('unavailable');
    expect(getBattleMatch).toHaveBeenCalledTimes(1);
  });

  it('경기 id가 없으면 묻지 않고, 언마운트하면 다음 조회를 멈춘다', async () => {
    const { result, rerender, unmount } = renderHook(({ id }) => useMatchPublished(id), { initialProps: { id: null as string | null } });
    await flush();
    expect(result.current.status).toBe('idle');
    expect(getBattleMatch).not.toHaveBeenCalled();

    getBattleMatch.mockRejectedValue(notFound());
    rerender({ id: 'm' });
    await flush();
    expect(getBattleMatch).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUBLISH_POLL_MS * 5);
    });
    expect(getBattleMatch).toHaveBeenCalledTimes(1);
  });
});
