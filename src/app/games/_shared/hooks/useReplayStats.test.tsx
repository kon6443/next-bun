// @vitest-environment jsdom
import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { WATCH_HEARTBEAT_MS, displayedViewCount, useRecordedViewCount, useReplayWatchReport } from './useReplayStats';
import { clearViewRequests } from '../lib/replayViews';

const recordReplayView = vi.fn();
const reportReplayWatch = vi.fn();
vi.mock('@/services/gameService', () => ({
  WATCH_REPORT_MAX_MS: 120_000,
  recordReplayView: (...args: unknown[]) => recordReplayView(...args),
  reportReplayWatch: (...args: unknown[]) => reportReplayWatch(...args),
}));

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useRecordedViewCount', () => {
  beforeEach(() => {
    recordReplayView.mockReset().mockResolvedValue({ code: 'SUCCESS', message: 'ok', data: { scoreId: 3, viewCount: 42, counted: true } });
    clearViewRequests();
    window.localStorage.clear();
  });

  it('StrictMode에서도 조회 요청은 1번, 서버 조회수를 돌려준다', async () => {
    const { result } = renderHook(() => useRecordedViewCount('tetris', 3, true), { wrapper: StrictMode });
    await act(async () => {});
    expect(recordReplayView).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(42);
  });

  it('오늘 이미 보냈으면 요청 없이 그때 받은 값', async () => {
    renderHook(() => useRecordedViewCount('tetris', 3, true)).unmount();
    await act(async () => {});
    const { result } = renderHook(() => useRecordedViewCount('tetris', 3, true));
    await act(async () => {});
    expect(recordReplayView).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(42);
  });

  it('재생 준비가 끝나기 전(playable=false)에는 보내지 않고, 준비되면 1번 보낸다', async () => {
    const { result, rerender } = renderHook(({ playable }) => useRecordedViewCount('defense', 11, playable), { initialProps: { playable: false } });
    await act(async () => {});
    expect(recordReplayView).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
    rerender({ playable: true });
    await act(async () => {});
    expect(recordReplayView).toHaveBeenCalledTimes(1);
    expect(recordReplayView).toHaveBeenCalledWith('defense', 11);
    expect(result.current).toBe(42);
  });

  it('표시 조회수는 조회 기록 응답과 재생 응답 중 큰 값, 둘 다 없으면 0', () => {
    expect(displayedViewCount(10, 9)).toBe(10);
    expect(displayedViewCount(10, 15)).toBe(15);
    expect(displayedViewCount(null, 4)).toBe(4);
    expect(displayedViewCount(null, undefined)).toBe(0);
  });
});

describe('useReplayWatchReport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reportReplayWatch.mockReset().mockResolvedValue({});
    setVisibility('visible');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('30초마다 쌓인 몫을 보낸다 — 쌓인 것이 없으면 보내지 않는다', () => {
    const { result } = renderHook(() => useReplayWatchReport('tetris', 5));
    result.current(1_000.4);
    result.current(2_000.4);
    vi.advanceTimersByTime(WATCH_HEARTBEAT_MS);
    expect(reportReplayWatch).toHaveBeenCalledTimes(1);
    expect(reportReplayWatch).toHaveBeenCalledWith('tetris', 5, 3000, { keepalive: false });
    vi.advanceTimersByTime(WATCH_HEARTBEAT_MS);
    expect(reportReplayWatch).toHaveBeenCalledTimes(1);
  });

  it('탭이 숨겨지면 keepalive로 남은 몫을 보낸다', () => {
    const { result } = renderHook(() => useReplayWatchReport('defense', 6));
    result.current(4_500);
    setVisibility('hidden');
    expect(reportReplayWatch).toHaveBeenCalledWith('defense', 6, 4500, { keepalive: true });
    // 보낸 몫은 차감됐다 — 다시 숨겨져도 겹쳐 보내지 않는다
    setVisibility('visible');
    setVisibility('hidden');
    expect(reportReplayWatch).toHaveBeenCalledTimes(1);
  });

  it('화면을 떠나면(unmount) 남은 몫을 보내고 주기 보고·탭 숨김 보고를 멈춘다', () => {
    const { result, unmount } = renderHook(() => useReplayWatchReport('tetris', 7));
    const add = result.current;
    add(800);
    unmount();
    expect(reportReplayWatch).toHaveBeenCalledWith('tetris', 7, 800, { keepalive: true });
    // 떠난 뒤 쌓인 몫이 있어도 남은 타이머·리스너가 보내지 않는다(정리 누락이면 여기서 보낸다 — Opus 리뷰 S2)
    add(500);
    vi.advanceTimersByTime(WATCH_HEARTBEAT_MS * 2);
    setVisibility('hidden');
    expect(reportReplayWatch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('StrictMode 이중 effect에서도 중복 보고·이중 타이머가 없다', () => {
    const { result } = renderHook(() => useReplayWatchReport('tetris', 8), { wrapper: StrictMode });
    expect(vi.getTimerCount()).toBe(1);
    result.current(10_000);
    vi.advanceTimersByTime(WATCH_HEARTBEAT_MS);
    expect(reportReplayWatch).toHaveBeenCalledTimes(1);
    expect(reportReplayWatch).toHaveBeenCalledWith('tetris', 8, 10_000, { keepalive: false });
  });

  it('보고 실패는 삼킨다(다시 보내지 않는다 — 중복보다 유실)', async () => {
    reportReplayWatch.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useReplayWatchReport('tetris', 9));
    result.current(1_000);
    vi.advanceTimersByTime(WATCH_HEARTBEAT_MS);
    await act(async () => {});
    vi.advanceTimersByTime(WATCH_HEARTBEAT_MS);
    expect(reportReplayWatch).toHaveBeenCalledTimes(1);
  });
});
