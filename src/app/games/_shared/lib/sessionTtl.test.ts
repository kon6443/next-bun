import { describe, it, expect } from 'vitest';
import { sessionTtlMs } from './sessionTtl';

const HOUR = 60 * 60 * 1000;

describe('세션 남은 시간 (Q-T1 — 테트리스·디펜스 같은 규칙)', () => {
  it('응답 expiresAt까지 남은 시간 — 게임별 상한(기기 시계가 늦어도 길게 잡지 않는다), 지났으면 0, 읽을 수 없으면 상한', () => {
    const now = Date.parse('2026-10-23T00:00:00Z');
    expect(sessionTtlMs('2026-10-23T00:30:00Z', now, 2 * HOUR)).toBe(HOUR / 2);
    expect(sessionTtlMs('2026-10-23T05:00:00Z', now, 2 * HOUR)).toBe(2 * HOUR);
    expect(sessionTtlMs('2026-10-23T05:00:00Z', now, 4 * HOUR)).toBe(4 * HOUR);
    expect(sessionTtlMs('2026-10-22T23:00:00Z', now, 2 * HOUR)).toBe(0);
    expect(sessionTtlMs('not-a-date', now, 2 * HOUR)).toBe(2 * HOUR);
    expect(sessionTtlMs(undefined, now, 4 * HOUR)).toBe(4 * HOUR);
  });
});
