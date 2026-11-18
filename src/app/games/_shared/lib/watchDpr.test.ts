// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchDevicePixelRatio } from './watchDpr';

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
});

function stubMatchMedia() {
  const live = new Map<string, () => void>();
  const matchMedia = vi.fn((query: string) => ({
    matches: true,
    media: query,
    addEventListener: (_: string, fn: () => void) => live.set(query, fn),
    removeEventListener: (_: string, fn: () => void) => {
      if (live.get(query) === fn) live.delete(query);
    },
  }));
  vi.stubGlobal('matchMedia', matchMedia);
  return { matchMedia, live };
}

describe('watchDevicePixelRatio', () => {
  it('지금 배율 질의가 풀리면 알리고 새 배율로 다시 건다 — 옛 질의는 뗀다', () => {
    const { matchMedia, live } = stubMatchMedia();
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
    const onChange = vi.fn();
    watchDevicePixelRatio(onChange);
    expect(matchMedia).toHaveBeenLastCalledWith('(resolution: 1dppx)');

    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
    live.get('(resolution: 1dppx)')!();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(matchMedia).toHaveBeenLastCalledWith('(resolution: 3dppx)');
    expect([...live.keys()]).toEqual(['(resolution: 3dppx)']);
  });

  it('그만 보면 리스너를 뗀다', () => {
    const { live } = stubMatchMedia();
    const stop = watchDevicePixelRatio(() => {});
    expect(live.size).toBe(1);
    stop();
    expect(live.size).toBe(0);
  });

  it('matchMedia가 없으면(옛 브라우저) 아무것도 하지 않는다', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(() => watchDevicePixelRatio(() => {})()).not.toThrow();
  });
});
