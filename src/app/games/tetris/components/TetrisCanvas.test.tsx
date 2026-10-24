// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import type { GameState } from '../engine';

const drawGame = vi.fn();
vi.mock('../lib/renderer', () => ({
  computeLayout: () => ({}),
  drawGame: (...a: unknown[]) => drawGame(...a),
}));

import { TetrisCanvas } from './TetrisCanvas';

beforeAll(() => {
  // jsdom에는 캔버스 그리기·ResizeObserver가 없다 — 그리기 호출만 센다
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    setTransform: () => {},
    save: () => {},
    restore: () => {},
    clearRect: () => {},
  } as unknown as CanvasRenderingContext2D);
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
});

describe('TetrisCanvas (FE-11)', () => {
  it('판이 그대로면(준비·일시정지·게임오버·재생 정지) 다시 그리지 않고, 프레임이 바뀌면 그린다', () => {
    const state = { frame: 10, over: false } as GameState;
    const stateRef = { current: state };
    const drawRef: { current: (() => void) | null } = { current: null };
    render(<TetrisCanvas stateRef={stateRef} drawRef={drawRef} />);
    const initial = drawGame.mock.calls.length;
    drawRef.current?.();
    drawRef.current?.();
    expect(drawGame.mock.calls.length).toBe(initial);
    state.frame = 11;
    drawRef.current?.();
    expect(drawGame.mock.calls.length).toBe(initial + 1);
    state.over = true;
    drawRef.current?.();
    expect(drawGame.mock.calls.length).toBe(initial + 2);
  });
});

describe('TetrisCanvas DPR (games-polish FE-19)', () => {
  it('크기는 그대로인데 DPR만 바뀌면(모니터 이동·확대) 백버퍼를 새 DPR로 다시 맞춘다', () => {
    const listeners: (() => void)[] = [];
    // jsdom에는 matchMedia가 없다 — 해상도 질의 리스너만 모은다
    const matchMedia = vi.fn(
      (query: string) =>
        ({
          matches: true,
          media: query,
          addEventListener: (_: string, fn: () => void) => listeners.push(fn),
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    vi.stubGlobal('matchMedia', matchMedia);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 200, top: 0, left: 0, right: 100, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
    const { container } = render(<TetrisCanvas stateRef={{ current: null }} drawRef={{ current: null }} />);
    const canvas = container.querySelector('canvas')!;
    expect(canvas.width).toBe(100);
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
    listeners[listeners.length - 1]();
    expect(canvas.width).toBe(200);
    expect(matchMedia).toHaveBeenLastCalledWith('(resolution: 2dppx)');
    vi.unstubAllGlobals();
  });
});

