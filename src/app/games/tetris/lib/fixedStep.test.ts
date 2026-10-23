import { describe, it, expect } from 'vitest';
import { advanceClock, createClock, resetClock } from './fixedStep';

describe('fixedStep (FE-23)', () => {
  it('첫 프레임은 0부터, 이후 지난 시간을 쌓고 한 번에 상한까지만, 배속은 상한 뒤에 곱한다', () => {
    const clock = createClock();
    advanceClock(clock, 1000, 100);
    expect(clock.acc).toBe(0);
    advanceClock(clock, 1016, 100);
    expect(clock.acc).toBe(16);
    advanceClock(clock, 5000, 100, 2);
    expect(clock.acc).toBe(16 + 200);
  });

  it('멈추면 비워서 다시 돌 때 멈춘 시간을 따라잡지 않는다', () => {
    const clock = createClock();
    advanceClock(clock, 1000, 10_000);
    advanceClock(clock, 1100, 10_000);
    resetClock(clock);
    advanceClock(clock, 9000, 10_000);
    expect(clock.acc).toBe(0);
  });
});
