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
