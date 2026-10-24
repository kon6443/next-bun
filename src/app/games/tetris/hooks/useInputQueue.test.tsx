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
      expect(result.current.take()).toEqual([1]);
      status.current = 'paused';
      result.current.releaseAll();
      expect(result.current.queueRef.current).toEqual(expected.slice(1));
      expect(result.current.heldRef.current.size).toBe(0);
    }
  });

  it('같은 프레임 탭 — 누름이 아직 큐에 있으면 뗌을 다음 틱으로 미뤄 누름이 한 프레임은 유지된다 (P9)', () => {
    const status = { current: 'playing' };
    const { result } = renderHook(() => useInputQueue(status, { keepReleaseWhenStopped: false }));
    result.current.press(5, 6);
    result.current.release(5);
    expect(result.current.take()).toEqual([5]);
    expect(result.current.take()).toEqual([6]);
    expect(result.current.take()).toEqual([]);
    // 누름이 이미 엔진에 갔으면 뗌은 바로 다음 틱
    result.current.press(5, 6);
    expect(result.current.take()).toEqual([5]);
    result.current.release(5);
    expect(result.current.take()).toEqual([6]);
    // clear는 미룬 뗌까지 비운다
    result.current.press(5, 6);
    result.current.release(5);
    result.current.clear();
    expect(result.current.take()).toEqual([]);
    expect(result.current.take()).toEqual([]);
  });
});
