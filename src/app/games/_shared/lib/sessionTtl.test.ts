import { describe, it, expect } from 'vitest';
import { sessionTtlMs } from './sessionTtl';

const HOUR = 60 * 60 * 1000;

describe('세션 남은 시간 (Q-T1 — 테트리스·디펜스 같은 규칙)', () => {
  const now = Date.parse('2026-10-23T00:00:00Z');

  it('ttlSeconds가 없으면 응답 expiresAt까지 남은 시간 — 게임별 상한(기기 시계가 늦어도 길게 잡지 않는다), 지났으면 0, 읽을 수 없으면 상한', () => {
    expect(sessionTtlMs({ expiresAt: '2026-10-23T00:30:00Z' }, now, 2 * HOUR)).toBe(HOUR / 2);
    expect(sessionTtlMs({ expiresAt: '2026-10-23T05:00:00Z' }, now, 2 * HOUR)).toBe(2 * HOUR);
    expect(sessionTtlMs({ expiresAt: '2026-10-23T05:00:00Z' }, now, 4 * HOUR)).toBe(4 * HOUR);
    expect(sessionTtlMs({ expiresAt: '2026-10-22T23:00:00Z' }, now, 2 * HOUR)).toBe(0);
    expect(sessionTtlMs({ expiresAt: 'not-a-date' }, now, 2 * HOUR)).toBe(2 * HOUR);
    expect(sessionTtlMs({}, now, 4 * HOUR)).toBe(4 * HOUR);
  });

  it('ttlSeconds가 있으면 기기 시계와 무관 — 시계가 1시간 빨라 expiresAt이 지난 것처럼 보여도 만료로 보지 않는다 (상한은 유지)', () => {
    // 서버 기준 2시간 세션, 기기 시계가 3시간 빠르다 → expiresAt은 기기 기준 1시간 전
    const fastNow = now + 3 * HOUR;
    expect(sessionTtlMs({ expiresAt: '2026-10-23T02:00:00Z', ttlSeconds: 7200 }, fastNow, 2 * HOUR)).toBe(2 * HOUR);
    expect(sessionTtlMs({ expiresAt: '2026-10-23T02:00:00Z', ttlSeconds: 7200 }, fastNow - 2 * HOUR, 2 * HOUR)).toBe(2 * HOUR);
    expect(sessionTtlMs({ ttlSeconds: 4 * 3600 }, now, 2 * HOUR)).toBe(2 * HOUR);
    // 읽을 수 없는 ttlSeconds는 expiresAt으로
    expect(sessionTtlMs({ expiresAt: '2026-10-23T00:30:00Z', ttlSeconds: 0 }, now, 2 * HOUR)).toBe(HOUR / 2);
  });
});
