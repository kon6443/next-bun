// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLazyRef } from './useLazyRef';

describe('useLazyRef (games-polish FE-60)', () => {
  it('첫 렌더에만 만들고 다시 렌더해도 같은 값', () => {
    const init = vi.fn(() => ({ n: 1 }));
    const { result, rerender } = renderHook(() => useLazyRef(init));
    const first = result.current.current;
    rerender();
    rerender();
    expect(init).toHaveBeenCalledTimes(1);
    expect(result.current.current).toBe(first);
  });
});
