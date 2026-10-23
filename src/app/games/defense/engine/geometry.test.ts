import { describe, it, expect } from 'vitest';
import { isqrt, lerpCoord } from './geometry';

describe('정수 기하 (§E1 — 음수 피제수 없음)', () => {
  it('isqrt = ⌊√n⌋ (정수 연산만)', () => {
    for (const n of [0, 1, 2, 3, 4, 8, 9, 15, 16, 99, 100, 101, 2 ** 31 - 1, 450_000_000, 9_007_199_254_740_991]) {
      const r = isqrt(n);
      expect(r * r <= n && (r + 1) * (r + 1) > n, `n=${n}`).toBe(true);
    }
  });

  it('lerpCoord: 감소 방향도 증가 방향과 대칭으로 내림 (음수 나눗셈을 하지 않는다)', () => {
    expect(lerpCoord(0, 1000, 1, 3)).toBe(333);
    expect(lerpCoord(1000, 0, 1, 3)).toBe(667); // 1000 − ⌊1000/3⌋
    expect(lerpCoord(7500, 1500, 3000, 6000)).toBe(4500);
    expect(lerpCoord(5, 5, 2, 4)).toBe(5);
    expect(lerpCoord(1500, 7500, 6000, 6000)).toBe(7500);
  });
});
