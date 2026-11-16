// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useGameCanvas } from './useGameCanvas';

function Harness() {
  const { canvasRef } = useGameCanvas();
  return (
    <div>
      <canvas ref={canvasRef} />
    </div>
  );
}

function renderAt(dpr: number) {
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: dpr });
  const scale = vi.fn();
  // jsdom에는 캔버스 그리기가 없다 — 배율 호출만 본다
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ scale } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 300, height: 200, top: 0, left: 0, right: 300, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
  const { container } = render(<Harness />);
  return { canvas: container.querySelector('canvas')!, scale };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
});

describe('useGameCanvas DPR 상한', () => {
  it('3x 기기는 백버퍼를 2배로 묶는다 — 표시 크기(CSS px)는 그대로', () => {
    const { canvas, scale } = renderAt(3);
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(400);
    expect(canvas.style.width).toBe('300px');
    expect(scale).toHaveBeenLastCalledWith(2, 2);
  });

  it('상한 아래(1.5x)는 기기 배율 그대로', () => {
    const { canvas, scale } = renderAt(1.5);
    expect(canvas.width).toBe(450);
    expect(scale).toHaveBeenLastCalledWith(1.5, 1.5);
  });
});
