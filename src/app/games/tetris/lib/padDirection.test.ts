import { describe, it, expect } from 'vitest';
import { padDirection } from './padDirection';

const at = (deg: number, r = 0.8) => [Math.cos((deg * Math.PI) / 180) * r, -Math.sin((deg * Math.PI) / 180) * r] as const;

describe('십자 패드 방향 판정 (games-polish P9)', () => {
  it('←→ ±55°, ↑ ±30°, ↓ ±35°, 그 사이·데드존은 방향 없음', () => {
    expect(padDirection(...at(0), null)).toBe('right');
    expect(padDirection(...at(54), null)).toBe('right');
    expect(padDirection(...at(180), null)).toBe('left');
    expect(padDirection(...at(-126), null)).toBe('left');
    expect(padDirection(...at(90), null)).toBe('up');
    expect(padDirection(...at(119), null)).toBe('up');
    expect(padDirection(...at(57), null)).toBeNull(); // ↑와 → 사이 틈
    expect(padDirection(...at(-90), null)).toBe('down');
    expect(padDirection(...at(-60), null)).toBe('down');
    expect(padDirection(...at(0, 0.1), null)).toBeNull();
    expect(padDirection(Number.NaN, 0, null)).toBeNull();
  });

  it('지금 방향은 경계를 12° 넘어야 바뀐다 — ←에서 ↑ 쪽으로 기울여도 이동이 끊기지 않는다', () => {
    expect(padDirection(...at(115), 'left')).toBe('left'); // ←의 경계(125°)에서 10° 안
    expect(padDirection(...at(110), 'left')).toBe('up'); // 경계+12°(113°)를 넘어 ↑ 범위 안
    expect(padDirection(...at(65), 'right')).toBe('right');
    expect(padDirection(...at(0, 0.17), 'right')).toBe('right'); // 누른 중에는 데드존이 작다
  });
});
