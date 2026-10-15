import { describe, it, expect } from 'vitest';
import { normalizeTimeValue, computeTimeRangeState, splitDuration } from './timeRange';

const at = (h: number, m = 0, s = 0) => new Date(2026, 9, 15, h, m, s);
const HOUR = 3600_000;

describe('normalizeTimeValue', () => {
  it('한 자리 시를 두 자리로 맞춘다', () => {
    expect(normalizeTimeValue('9:00')).toBe('09:00');
    expect(normalizeTimeValue('18:30')).toBe('18:30');
  });

  it('비었거나 형식이 틀리면 null', () => {
    expect(normalizeTimeValue('')).toBeNull();
    expect(normalizeTimeValue(null)).toBeNull();
    expect(normalizeTimeValue('24:00')).toBeNull();
    expect(normalizeTimeValue('9:5')).toBeNull();
    expect(normalizeTimeValue('abc')).toBeNull();
  });
});

describe('computeTimeRangeState', () => {
  it('시작과 종료가 같으면 invalid (0으로 나누지 않는다)', () => {
    expect(computeTimeRangeState(at(10), '09:00', '09:00')).toEqual({ phase: 'invalid' });
  });

  it('시작 전이면 시작까지 남은 시간', () => {
    expect(computeTimeRangeState(at(7), '09:00', '18:00')).toEqual({
      phase: 'before',
      untilStartMs: 2 * HOUR,
      totalMs: 9 * HOUR,
    });
  });

  it('진행 중이면 진행률·남은·경과 시간', () => {
    const state = computeTimeRangeState(at(13, 30), '09:00', '18:00');
    expect(state).toEqual({
      phase: 'running',
      progress: 50,
      remainingMs: 4.5 * HOUR,
      elapsedMs: 4.5 * HOUR,
      totalMs: 9 * HOUR,
    });
  });

  it('시작 시각 정각은 진행 중, 종료 시각 정각은 완료', () => {
    expect(computeTimeRangeState(at(9), '09:00', '18:00').phase).toBe('running');
    expect(computeTimeRangeState(at(18), '09:00', '18:00')).toEqual({ phase: 'done', totalMs: 9 * HOUR });
  });

  it('종료가 시작보다 이르면 야간 구간 — 종료를 다음 날로 본다', () => {
    const evening = computeTimeRangeState(at(23), '22:00', '06:00');
    expect(evening).toMatchObject({ phase: 'running', elapsedMs: HOUR, remainingMs: 7 * HOUR, totalMs: 8 * HOUR });
  });

  it('야간 구간은 자정을 넘긴 새벽도 전날 시작한 구간으로 진행 중', () => {
    const dawn = computeTimeRangeState(at(2), '22:00', '06:00');
    expect(dawn).toMatchObject({ phase: 'running', progress: 50, remainingMs: 4 * HOUR });
  });

  it('야간 구간이 끝난 낮에는 오늘 밤 시작 전', () => {
    expect(computeTimeRangeState(at(12), '22:00', '06:00')).toEqual({
      phase: 'before',
      untilStartMs: 10 * HOUR,
      totalMs: 8 * HOUR,
    });
  });
});

describe('splitDuration', () => {
  it('시·분·초로 나누고 음수는 0', () => {
    expect(splitDuration(3 * HOUR + 4 * 60_000 + 5_999)).toEqual({ hours: 3, minutes: 4, seconds: 5 });
    expect(splitDuration(-1)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
  });
});
