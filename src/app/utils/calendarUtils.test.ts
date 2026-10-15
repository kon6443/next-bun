import { describe, it, expect } from 'vitest';
import { countHiddenTasksForDay, parseCalendarMonth, formatCalendarMonth, choosePopoverPlacement } from './calendarUtils';

describe('countHiddenTasksForDay', () => {
  const bars = [
    { startCol: 0, span: 7, row: 0 },
    { startCol: 1, span: 3, row: 1 },
    { startCol: 2, span: 2, row: 2 }, // 화(2)~수(3)에 걸친 세 번째 줄 — 숨는다
  ];

  it('보이는 줄 아래로 밀린 멀티데이 바는 그 바가 지나는 날짜마다 센다', () => {
    expect(countHiddenTasksForDay(bars, 2, 0)).toBe(1);
    expect(countHiddenTasksForDay(bars, 3, 0)).toBe(1);
    expect(countHiddenTasksForDay(bars, 4, 0)).toBe(0);
    expect(countHiddenTasksForDay(bars, 6, 0)).toBe(0);
  });

  it('단일 태스크는 2개를 넘은 만큼, 숨은 바와 합산한다', () => {
    expect(countHiddenTasksForDay([], 0, 2)).toBe(0);
    expect(countHiddenTasksForDay([], 0, 5)).toBe(3);
    expect(countHiddenTasksForDay(bars, 2, 3)).toBe(2);
  });
});

describe('parseCalendarMonth / formatCalendarMonth', () => {
  it('YYYY-MM을 그 달 1일로 바꾸고 되돌린다', () => {
    const date = parseCalendarMonth('2026-03');
    expect(date).toEqual(new Date(2026, 2, 1));
    expect(formatCalendarMonth(date)).toBe('2026-03');
  });

  it('없거나 형식이 틀리면 이번 달 1일', () => {
    const today = new Date(2026, 9, 15);
    expect(parseCalendarMonth(undefined, today)).toEqual(new Date(2026, 9, 1));
    expect(parseCalendarMonth('2026-13', today)).toEqual(new Date(2026, 9, 1));
  });
});

describe('choosePopoverPlacement', () => {
  // 화면: 헤더 아래 경계 200, 하단 내비 top 749 (데스크톱 실측과 같은 구조)
  const base = { topLimit: 200, bottomLimit: 749, gap: 8 };

  it('아래에 다 들어가면 아래', () => {
    const r = choosePopoverPlacement({ ...base, anchorTop: 300, anchorBottom: 320, contentHeight: 300 });
    expect(r).toEqual({ placement: 'below', maxHeight: 320, top: 328 });
  });

  it('아래가 하단 내비에 걸리면 위로 — 헤더(topLimit) 위로는 넘지 않는다', () => {
    const r = choosePopoverPlacement({ ...base, anchorTop: 600, anchorBottom: 620, contentHeight: 320 });
    expect(r.placement).toBe('above');
    expect(r.top).toBeGreaterThanOrEqual(base.topLimit);
    expect(r.top + Math.min(320, r.maxHeight)).toBeLessThanOrEqual(600 - 8);
  });

  it('위·아래 모두 모자라면 넓은 쪽에 넣고 높이를 줄인다 (내비·헤더를 덮지 않는다)', () => {
    const r = choosePopoverPlacement({ ...base, anchorTop: 440, anchorBottom: 460, contentHeight: 320 });
    // 아래 281 / 위 232 → 아래, 높이 281로 제한
    expect(r).toEqual({ placement: 'below', maxHeight: 281, top: 468 });
    expect(r.top + r.maxHeight).toBeLessThanOrEqual(base.bottomLimit);
  });

  it('공간이 아주 좁아도 최소 높이는 보장한다', () => {
    const r = choosePopoverPlacement({ ...base, bottomLimit: 300, anchorTop: 230, anchorBottom: 250, contentHeight: 320 });
    expect(r.maxHeight).toBe(96);
  });

  it('방향을 넘기면 그 방향을 유지하고 높이만 다시 맞춘다 (스크롤 중 뒤집힘 방지)', () => {
    const r = choosePopoverPlacement({ ...base, anchorTop: 300, anchorBottom: 320, contentHeight: 300, placement: 'above' });
    expect(r.placement).toBe('above');
    // 위 공간 92(300-8-200)는 최소 높이보다 작아 96을 보장한다
    expect(r.maxHeight).toBe(96);
  });

  it('앵커가 하단 경계(FAB·내비)보다 아래에 있으면 위로 띄우되 아래 끝을 그 경계에 맞춘다', () => {
    // 데스크톱 재측정: 앵커 y≈790, FAB top 경계 741 — 예전에는 앵커 top 에 붙어 FAB·내비를 덮었다
    const r = choosePopoverPlacement({ ...base, bottomLimit: 741, anchorTop: 790, anchorBottom: 806, contentHeight: 320 });
    expect(r.placement).toBe('above');
    expect(r.top + Math.min(320, r.maxHeight)).toBeLessThanOrEqual(741);
    expect(r.top).toBeGreaterThanOrEqual(base.topLimit);
  });
});
