import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isTaskRangeInverted,
  daysBetween,
  generateDateRange,
  normalizeDate,
  getToday,
  getTodayKey,
  buildTaskDatetime,
  parseTaskDatetime,
  getMonthDays,
  generateCalendarGrid,
  splitIntoWeeks,
  isWeekend,
  isToday,
  formatCompactDateTime,
} from './dateUtils';

describe('isTaskRangeInverted', () => {
  it('종료일이 시작일보다 앞서면 true', () => {
    expect(isTaskRangeInverted('2026-10-20', '00:00', '2026-10-18', '23:59')).toBe(true);
  });

  it('같은 날 종료 시간이 시작 시간보다 앞서면 true', () => {
    expect(isTaskRangeInverted('2026-10-20', '15:00', '2026-10-20', '09:00')).toBe(true);
  });

  it('같은 날 같은 시간은 허용 (시작 :00초, 종료 :59초)', () => {
    expect(isTaskRangeInverted('2026-10-20', '10:00', '2026-10-20', '10:00')).toBe(false);
  });

  it('1분이라도 역전되면 true (백엔드 assertValidTaskPeriod와 같은 경계)', () => {
    expect(isTaskRangeInverted('2026-10-20', '10:01', '2026-10-20', '10:00')).toBe(true);
  });

  it('정상 범위와 기본 시간(미입력)은 false', () => {
    expect(isTaskRangeInverted('2026-10-18', '09:00', '2026-10-20', '18:00')).toBe(false);
    expect(isTaskRangeInverted('2026-10-20', undefined, '2026-10-20', undefined)).toBe(false);
  });

  it('해석할 수 없는 날짜(5자리 연도)는 던지지 않고 false — 렌더 중 호출되므로', () => {
    expect(isTaskRangeInverted('20261-10-20', '00:00', '2026-10-18', '23:59')).toBe(false);
  });

  it('시작·종료 중 하나라도 날짜가 없으면 판정하지 않음', () => {
    expect(isTaskRangeInverted('', '00:00', '2026-10-18', '23:59')).toBe(false);
    expect(isTaskRangeInverted('2026-10-20', '00:00', '', '23:59')).toBe(false);
  });
});

// 아래는 모두 로컬 생성자(new Date(y, m, d, ...)) 기반 — 실행 환경 TZ와 무관하게 통과해야 한다

describe('daysBetween', () => {
  it('시각과 무관하게 로컬 날짜 차이만 센다', () => {
    expect(daysBetween(new Date(2026, 9, 20, 23, 59), new Date(2026, 9, 21, 0, 1))).toBe(1);
    expect(daysBetween(new Date(2026, 9, 20, 0, 0), new Date(2026, 9, 20, 23, 59))).toBe(0);
  });

  it('역순이면 음수', () => {
    expect(daysBetween(new Date(2026, 9, 21), new Date(2026, 9, 18))).toBe(-3);
  });

  it('월·연 경계(윤년 2월 포함)를 넘는다', () => {
    expect(daysBetween(new Date(2028, 1, 28), new Date(2028, 2, 1))).toBe(2);
    expect(daysBetween(new Date(2026, 11, 31), new Date(2027, 0, 1))).toBe(1);
  });
});

describe('generateDateRange', () => {
  it('양 끝을 포함하고 모두 로컬 자정이다', () => {
    const range = generateDateRange(new Date(2026, 9, 30, 15, 0), new Date(2026, 10, 2, 1, 0));
    expect(range).toEqual([
      new Date(2026, 9, 30),
      new Date(2026, 9, 31),
      new Date(2026, 10, 1),
      new Date(2026, 10, 2),
    ]);
  });

  it('같은 날이면 1개, 역순이면 빈 배열', () => {
    expect(generateDateRange(new Date(2026, 9, 20, 9), new Date(2026, 9, 20, 18))).toHaveLength(1);
    expect(generateDateRange(new Date(2026, 9, 21), new Date(2026, 9, 20))).toEqual([]);
  });

  it('입력 Date를 변경하지 않는다', () => {
    const start = new Date(2026, 9, 20, 15, 30);
    generateDateRange(start, new Date(2026, 9, 22));
    expect(start).toEqual(new Date(2026, 9, 20, 15, 30));
  });
});

describe('normalizeDate', () => {
  it('로컬 자정으로 맞춘 새 객체를 반환하고 원본은 그대로', () => {
    const src = new Date(2026, 9, 20, 23, 59, 59, 999);
    expect(normalizeDate(src)).toEqual(new Date(2026, 9, 20));
    expect(src.getHours()).toBe(23);
  });
});

describe('getToday / getTodayKey / isToday', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('로컬 23:59에도 오늘 날짜를 쓴다 (UTC로 넘어가지 않음)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 23, 59));
    expect(getToday()).toEqual(new Date(2026, 0, 5));
    expect(getTodayKey()).toBe('2026-01-05');
  });

  it('isToday는 시각과 무관하게 로컬 날짜만 비교한다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 20, 0, 5));
    expect(isToday(new Date(2026, 9, 20, 23, 59))).toBe(true);
    expect(isToday(new Date(2026, 9, 19, 23, 59))).toBe(false);
    expect(isToday(new Date(2025, 9, 20, 12, 0))).toBe(false);
  });
});

describe('buildTaskDatetime', () => {
  it('로컬 시각으로 해석해 ISO(UTC) 문자열로 — 시작은 :00초', () => {
    expect(buildTaskDatetime('2026-10-20', '10:30', 'start')).toBe(new Date(2026, 9, 20, 10, 30, 0).toISOString());
  });

  it('종료는 :59초', () => {
    expect(buildTaskDatetime('2026-10-20', '10:30', 'end')).toBe(new Date(2026, 9, 20, 10, 30, 59).toISOString());
  });

  it('시간 미입력이면 시작 00:00:00, 종료 23:59:59', () => {
    expect(buildTaskDatetime('2026-10-20', undefined, 'start')).toBe(new Date(2026, 9, 20, 0, 0, 0).toISOString());
    expect(buildTaskDatetime('2026-10-20', '', 'end')).toBe(new Date(2026, 9, 20, 23, 59, 59).toISOString());
  });

  it('날짜가 없으면 null', () => {
    expect(buildTaskDatetime('', '10:00', 'start')).toBeNull();
  });
});

describe('parseTaskDatetime', () => {
  it('로컬 기준 날짜·시간으로 분리하고 0을 채운다', () => {
    expect(parseTaskDatetime(new Date(2026, 0, 5, 7, 3))).toEqual({ date: '2026-01-05', time: '07:03' });
  });

  it('buildTaskDatetime 결과를 되돌리면 원래 입력이 나온다 (왕복)', () => {
    const iso = buildTaskDatetime('2026-12-31', '23:45', 'end');
    expect(parseTaskDatetime(iso)).toEqual({ date: '2026-12-31', time: '23:45' });
  });

  it('null·빈 문자열·해석 불가 문자열은 빈 값', () => {
    const empty = { date: '', time: '' };
    expect(parseTaskDatetime(null)).toEqual(empty);
    expect(parseTaskDatetime(undefined)).toEqual(empty);
    expect(parseTaskDatetime('')).toEqual(empty);
    expect(parseTaskDatetime('not-a-date')).toEqual(empty);
  });
});

describe('getMonthDays', () => {
  it('월의 첫날·마지막날 (윤년 2월, 12월)', () => {
    expect(getMonthDays(2028, 1)).toEqual({ firstDay: new Date(2028, 1, 1), lastDay: new Date(2028, 1, 29) });
    expect(getMonthDays(2026, 1).lastDay).toEqual(new Date(2026, 1, 28));
    expect(getMonthDays(2026, 11).lastDay).toEqual(new Date(2026, 11, 31));
  });
});

describe('generateCalendarGrid', () => {
  it('항상 42칸이고 일요일부터 시작해 하루씩 이어진다', () => {
    // 2026-10-01은 목요일
    const grid = generateCalendarGrid(2026, 9);
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual(new Date(2026, 8, 27)); // 9/27(일)
    expect(grid[0].getDay()).toBe(0);
    expect(grid[4]).toEqual(new Date(2026, 9, 1));
    for (let i = 1; i < grid.length; i++) {
      const prev = grid[i - 1];
      expect(grid[i]).toEqual(new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1));
    }
  });

  it('1일이 일요일이면 이전 달 칸 없이 1일부터', () => {
    // 2026-02-01은 일요일
    const grid = generateCalendarGrid(2026, 1);
    expect(grid[0]).toEqual(new Date(2026, 1, 1));
    expect(grid[41]).toEqual(new Date(2026, 2, 14));
  });

  it('1월·12월은 연도를 넘는다', () => {
    expect(generateCalendarGrid(2026, 0)[0]).toEqual(new Date(2025, 11, 28)); // 2026-01-01은 목요일
    expect(generateCalendarGrid(2026, 11)[41]).toEqual(new Date(2027, 0, 9)); // 2026-12-01은 화요일
  });
});

describe('splitIntoWeeks', () => {
  it('7개씩 나누고 나머지는 마지막 주에 남긴다', () => {
    expect(splitIntoWeeks(Array.from({ length: 42 }, (_, i) => i))).toHaveLength(6);
    expect(splitIntoWeeks([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([[1, 2, 3, 4, 5, 6, 7], [8]]);
    expect(splitIntoWeeks([])).toEqual([]);
  });
});

describe('isWeekend', () => {
  it('토·일만 true', () => {
    expect(isWeekend(new Date(2026, 9, 24))).toBe(true); // 토
    expect(isWeekend(new Date(2026, 9, 25))).toBe(true); // 일
    expect(isWeekend(new Date(2026, 9, 26))).toBe(false); // 월
    expect(isWeekend(new Date(2026, 9, 23))).toBe(false); // 금
  });
});

describe('formatCompactDateTime', () => {
  it('올해면 연도 없이 월.일 시:분(로컬), 다른 해면 연도를 붙인다', () => {
    const now = new Date(2026, 9, 26, 12, 0);
    expect(formatCompactDateTime(new Date(2026, 9, 21, 9, 5), now)).toBe('10.21 09:05');
    expect(formatCompactDateTime(new Date(2025, 0, 3, 0, 30), now)).toBe('2025.1.3 00:30');
  });
});
