import { describe, it, expect } from 'vitest';
import { isTaskRangeInverted } from './dateUtils';

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
