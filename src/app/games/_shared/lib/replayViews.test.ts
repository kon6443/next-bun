// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearViewRequests, createWatchMeter, kstDate, recordViewOncePerDay, viewStorageKey } from './replayViews';

const recordReplayView = vi.fn();
vi.mock('@/services/gameService', () => ({
  WATCH_REPORT_MAX_MS: 120_000,
  recordReplayView: (...args: unknown[]) => recordReplayView(...args),
}));

// 2026-10-24 14:59:59Z = KST 23:59:59, 15:00Z = KST 다음 날 0시
const BEFORE_KST_MIDNIGHT = Date.parse('2026-10-24T14:59:59Z');
const KST_MIDNIGHT = Date.parse('2026-10-24T15:00:00Z');
const ok = (viewCount: number) => ({ code: 'SUCCESS', message: 'ok', data: { scoreId: 7, viewCount, counted: true } });

describe('kstDate — 기기 시간대와 무관한 KST 날짜', () => {
  it('UTC 15시에 날짜가 넘어간다', () => {
    expect(kstDate(BEFORE_KST_MIDNIGHT)).toBe('2026-10-24');
    expect(kstDate(KST_MIDNIGHT)).toBe('2026-10-25');
    expect(viewStorageKey('tetris', 7, KST_MIDNIGHT)).toBe('view:tetris:7:2026-10-25');
  });
});

describe('recordViewOncePerDay — 브라우저당 하루 1회', () => {
  beforeEach(() => {
    recordReplayView.mockReset();
    clearViewRequests();
    window.localStorage.clear();
  });

  it('처음엔 보내고 조회수를 돌려준다 — 같은 날 다시 들어오면 요청 없이 그때 받은 값, 다음 날은 다시 보낸다', async () => {
    recordReplayView.mockResolvedValue(ok(12));
    await expect(recordViewOncePerDay('tetris', 7, BEFORE_KST_MIDNIGHT)).resolves.toBe(12);
    expect(window.localStorage.getItem('view:tetris:7:2026-10-24')).toBe('12');
    // 재방문 표시가 진입 전 값(재생 응답 캐시)으로 줄지 않게 받은 값을 돌려준다 (Opus 리뷰 S1)
    await expect(recordViewOncePerDay('tetris', 7, BEFORE_KST_MIDNIGHT)).resolves.toBe(12);
    expect(recordReplayView).toHaveBeenCalledTimes(1);

    recordReplayView.mockResolvedValue(ok(13));
    await expect(recordViewOncePerDay('tetris', 7, KST_MIDNIGHT)).resolves.toBe(13);
    expect(recordReplayView).toHaveBeenCalledTimes(2);
    // 지난 날 키는 지워 쌓이지 않는다
    expect(window.localStorage.getItem('view:tetris:7:2026-10-24')).toBeNull();
  });

  it('응답 전에 다시 불러도(StrictMode 이중 effect) 요청은 1번', async () => {
    recordReplayView.mockResolvedValue(ok(3));
    const [a, b] = await Promise.all([recordViewOncePerDay('defense', 9, KST_MIDNIGHT), recordViewOncePerDay('defense', 9, KST_MIDNIGHT)]);
    expect(recordReplayView).toHaveBeenCalledTimes(1);
    expect(recordReplayView).toHaveBeenCalledWith('defense', 9);
    expect([a, b]).toEqual([3, 3]);
  });

  it('실패(404 포함)는 조용히 null, 키를 남기지 않아 다음 진입에 다시 보낸다', async () => {
    recordReplayView.mockRejectedValueOnce(new Error('404')).mockResolvedValueOnce(ok(1));
    await expect(recordViewOncePerDay('tetris', 8, KST_MIDNIGHT)).resolves.toBeNull();
    expect(window.localStorage.getItem('view:tetris:8:2026-10-25')).toBeNull();
    await expect(recordViewOncePerDay('tetris', 8, KST_MIDNIGHT)).resolves.toBe(1);
    expect(recordReplayView).toHaveBeenCalledTimes(2);
  });

  it('저장된 값이 숫자가 아니면 요청 없이 null — 표시는 재생 응답으로 폴백', async () => {
    window.localStorage.setItem('view:tetris:3:2026-10-25', '1x');
    await expect(recordViewOncePerDay('tetris', 3, KST_MIDNIGHT)).resolves.toBeNull();
    expect(recordReplayView).not.toHaveBeenCalled();
  });

  it('저장소가 막혀도 조회는 보낸다', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    recordReplayView.mockResolvedValue(ok(5));
    await expect(recordViewOncePerDay('tetris', 4, KST_MIDNIGHT)).resolves.toBe(5);
    expect(recordReplayView).toHaveBeenCalledTimes(1);
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

describe('createWatchMeter — 보낼 몫', () => {
  it('정수 ms만 꺼내고 소수 나머지는 남긴다, 1 미만이면 보내지 않는다', () => {
    const meter = createWatchMeter();
    meter.add(0.6);
    expect(meter.take()).toEqual([]);
    meter.add(16.7);
    expect(meter.take()).toEqual([17]);
    // 0.6 + 16.7 - 17 = 0.3 남음
    meter.add(0.7);
    expect(meter.take()).toEqual([1]);
  });

  it('꺼낸 몫은 먼저 차감한다 — 다시 꺼내면 비어 있다', () => {
    const meter = createWatchMeter();
    meter.add(500);
    expect(meter.take()).toEqual([500]);
    expect(meter.take()).toEqual([]);
  });

  it('1회 상한(120000)을 넘으면 나눈다', () => {
    const meter = createWatchMeter();
    meter.add(250_000);
    expect(meter.take()).toEqual([120_000, 120_000, 10_000]);
  });

  it('음수·NaN·Infinity는 무시한다', () => {
    const meter = createWatchMeter();
    meter.add(-5);
    meter.add(Number.NaN);
    meter.add(Number.POSITIVE_INFINITY);
    expect(meter.take()).toEqual([]);
  });
});
