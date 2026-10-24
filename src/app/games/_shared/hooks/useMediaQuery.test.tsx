// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery';

afterEach(() => vi.unstubAllGlobals());

describe('useMediaQuery (games-polish FE-55)', () => {
  it('지금 값으로 시작하고 질의가 바뀌면 따라간다, matchMedia가 없으면 false', () => {
    let matches = true;
    const listeners: (() => void)[] = [];
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
      removeEventListener: () => {},
    }));
    const { result } = renderHook(() => useMediaQuery('(pointer: coarse)'));
    expect(result.current).toBe(true);
    act(() => {
      matches = false;
      listeners.forEach((fn) => fn());
    });
    expect(result.current).toBe(false);
    vi.unstubAllGlobals();
    vi.stubGlobal('matchMedia', undefined);
    expect(renderHook(() => useMediaQuery('(pointer: coarse)')).result.current).toBe(false);
  });
});
