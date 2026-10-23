import { describe, it, expect } from 'vitest';
import { SESSION_TTL_MS, sessionClockAt } from './useSessionClock';

describe('sessionClockAt — 받은 뒤 흐른 시간으로 판정', () => {
  const t0 = 1_000_000;
  it('세션 없음 → none, 30분 넘게 남음 → ok, 30분 이내 → warn, 1분 이내 → expired', () => {
    expect(sessionClockAt(null, t0)).toBe('none');
    expect(sessionClockAt(t0, t0)).toBe('ok');
    expect(sessionClockAt(t0, t0 + SESSION_TTL_MS - 30 * 60 * 1000 - 1)).toBe('ok');
    expect(sessionClockAt(t0, t0 + SESSION_TTL_MS - 30 * 60 * 1000)).toBe('warn');
    expect(sessionClockAt(t0, t0 + SESSION_TTL_MS - 60 * 1000 - 1)).toBe('warn');
    expect(sessionClockAt(t0, t0 + SESSION_TTL_MS - 60 * 1000)).toBe('expired');
  });
});
