// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLatestFlag } from './useLatestFlag';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('useLatestFlag', () => {
  it('겹친 작업은 마지막 작업이 끝나야 꺼진다', async () => {
    const { result } = renderHook(() => useLatestFlag(false));
    const first = deferred();
    const second = deferred();

    let p1!: Promise<void>;
    let p2!: Promise<void>;
    act(() => {
      p1 = result.current[1](() => first.promise);
      p2 = result.current[1](() => second.promise);
    });
    expect(result.current[0]).toBe(true);

    await act(async () => {
      first.resolve();
      await p1;
    });
    expect(result.current[0]).toBe(true);

    await act(async () => {
      second.resolve();
      await p2;
    });
    expect(result.current[0]).toBe(false);
  });

  it('서로 다른 플래그는 순번을 공유하지 않는다 — 초기 로딩 중 탭 재조회가 시작돼도 초기 로딩 표시는 꺼진다', async () => {
    const { result } = renderHook(() => ({ initial: useLatestFlag(true), tab: useLatestFlag(false) }));
    const initialLoad = deferred();
    const tabRefetch = deferred();

    let pInitial!: Promise<void>;
    let pTab!: Promise<void>;
    act(() => {
      pInitial = result.current.initial[1](() => initialLoad.promise);
      pTab = result.current.tab[1](() => tabRefetch.promise);
    });

    await act(async () => {
      tabRefetch.resolve();
      await pTab;
    });
    expect(result.current.tab[0]).toBe(false);
    expect(result.current.initial[0]).toBe(true);

    await act(async () => {
      initialLoad.resolve();
      await pInitial;
    });
    expect(result.current.initial[0]).toBe(false);
  });

  it('작업이 실패해도 끈다', async () => {
    const { result } = renderHook(() => useLatestFlag(false));
    await act(async () => {
      await result.current[1](() => Promise.reject(new Error('x'))).catch(() => {});
    });
    expect(result.current[0]).toBe(false);
  });
});
