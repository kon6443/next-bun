// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useInputQueue } from './useInputQueue';

describe('useInputQueue — 싱글·대전 공용 입력 큐 (games-polish FE-54)', () => {
  it('진행 중에만 누름·즉시 동작을 받고, 같은 키를 두 번 누르지 않는다', () => {
    const status = { current: 'ready' };
    const { result } = renderHook(() => useInputQueue(status, { keepReleaseWhenStopped: true }));
    result.current.press(1, 2);
    result.current.instant(9);
    expect(result.current.queueRef.current).toEqual([]);
    status.current = 'playing';
    result.current.press(1, 2);
    result.current.press(1, 2);
    result.current.instant(9);
    expect(result.current.queueRef.current).toEqual([1, 9]);
  });

  it('멈춘 동안 뗀 키 — 싱글(keepReleaseWhenStopped)은 큐에 남기고, 대전은 버린다', () => {
    for (const [keep, expected] of [
      [true, [1, 2]],
      [false, [1]],
    ] as const) {
      const status = { current: 'playing' };
      const { result } = renderHook(() => useInputQueue(status, { keepReleaseWhenStopped: keep }));
      result.current.press(1, 2);
      status.current = 'paused';
      result.current.releaseAll();
      expect(result.current.queueRef.current).toEqual(expected);
      expect(result.current.heldRef.current.size).toBe(0);
    }
  });
});
