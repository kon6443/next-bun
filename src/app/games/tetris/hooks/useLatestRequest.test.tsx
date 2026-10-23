// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLatestRequest } from './useLatestRequest';

describe('useLatestRequest (FE-21)', () => {
  it('새 요청이 시작되면 이전 요청의 늦은 응답은 버린다 — 마지막 것만 반영', () => {
    const { result, rerender } = renderHook(() => useLatestRequest());
    const first = result.current();
    rerender();
    const second = result.current();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });
});
