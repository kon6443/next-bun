// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ParticlePool } from '../renderer/particles';
import { DRAW_BUDGET_MS } from '../renderer/quality';
import { useAutoQuality } from './useAutoQuality';

/** 그리기 시간 drawMs로 ms 동안 60Hz 프레임을 넣는다 */
function feed(record: (drawMs: number, nowMs: number, particles: ParticlePool) => void, particles: ParticlePool, from: number, ms: number, drawMs: number): number {
  let now = from;
  for (; now < from + ms; now += 16) record(drawMs, now, particles);
  return now;
}

describe('useAutoQuality — 그리기가 예산을 계속 넘으면 단계적으로 낮춘다 (games-polish FE-09)', () => {
  it('빠른 기기(예산 안)는 처음 품질 그대로 — DPR 상한·숫자·파티클 칸 수 유지', () => {
    const particles = new ParticlePool(400);
    const { result } = renderHook(() => useAutoQuality(2));
    act(() => {
      feed(result.current.record, particles, 0, 10_000, DRAW_BUDGET_MS / 2);
    });
    expect(result.current.dprCap).toBe(2);
    expect(result.current.numbersAllowedRef.current).toBe(true);
    expect(particles.limit).toBe(400);
  });

  it('느린 기기는 2초 넘게 이어질 때마다 숫자 끔 → 파티클 절반 → DPR 1.5 → DPR 1, 다시 빨라져도 올리지 않는다', () => {
    const particles = new ParticlePool(400);
    const { result } = renderHook(() => useAutoQuality(2));
    let now = 0;
    act(() => {
      now = feed(result.current.record, particles, now, 2_100, DRAW_BUDGET_MS * 3);
    });
    expect(result.current.numbersAllowedRef.current).toBe(false);
    expect(result.current.dprCap).toBe(2);
    act(() => {
      now = feed(result.current.record, particles, now, 2_100, DRAW_BUDGET_MS * 3);
    });
    expect(particles.limit).toBe(200);
    act(() => {
      now = feed(result.current.record, particles, now, 4_300, DRAW_BUDGET_MS * 3);
    });
    expect(result.current.dprCap).toBe(1);
    act(() => {
      feed(result.current.record, particles, now, 10_000, 1);
    });
    expect(result.current.dprCap).toBe(1);
    expect(particles.limit).toBe(200);
  });
});
