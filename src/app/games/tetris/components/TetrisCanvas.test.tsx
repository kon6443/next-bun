// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import type { GameState } from '../engine';

const drawGame = vi.fn();
vi.mock('../lib/renderer', () => ({
  computeLayout: () => ({}),
  drawGame: (...a: unknown[]) => drawGame(...a),
}));

import { TetrisCanvas, __resetCanvasQualityForTests } from './TetrisCanvas';

const L1 = { block: 1, effect: 1, board: 1 };

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

describe('TetrisCanvas 저사양 감지 (렌더 성능 a3)', () => {
  it('판 도중 느려지면(약 45fps) 가벼운 품질로 그리고, 다시 빨라지면 유지 시간 뒤 원래 품질로 돌아온다', () => {
    __resetCanvasQualityForTests();
    let now = 1000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const state = { frame: 0, over: false } as GameState;
    const drawRef: { current: (() => void) | null } = { current: null };
    render(<TetrisCanvas stateRef={{ current: state }} drawRef={drawRef} effectsRef={{ current: null }} />);
    const play = (gap: number, ms: number) => {
      for (let t = 0; t < ms; t += gap) {
        now += gap;
        state.frame++;
        drawRef.current?.();
      }
      return drawGame.mock.lastCall?.[3].quality;
    };
    try {
      expect(play(1000 / 60, 60_000)).toBe('full');
      expect(play(22, 5_000)).toBe('lite');
      expect(play(1000 / 60, 5_000)).toBe('lite');
      expect(play(1000 / 60, 10_000)).toBe('full');
    } finally {
      clock.mockRestore();
    }
  });

  it('0.5배속 재생(화면 프레임 2번에 엔진 프레임 1번)은 느린 기기가 아니다 — 그린 간격이 아니라 화면 프레임 간격을 잰다 (리뷰 S2·S3)', () => {
    __resetCanvasQualityForTests();
    let now = 1000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const state = { frame: 0, over: false } as GameState;
    const drawRef: { current: (() => void) | null } = { current: null };
    render(<TetrisCanvas stateRef={{ current: state }} drawRef={drawRef} effectsRef={{ current: null }} />);
    try {
      for (let i = 0; i < 60 * 30; i++) {
        now += 1000 / 60;
        if (i % 2 === 0) state.frame++;
        drawRef.current?.();
      }
      expect(drawGame.mock.lastCall?.[3].quality).toBe('full');
    } finally {
      clock.mockRestore();
    }
  });
});

describe('TetrisCanvas 저사양 감지 — 화면 프레임이 아닌 그리기 (리뷰 2차)', () => {
  it('스킨이 바뀌어 다시 그려도 표본이 아니다 — 느린 화면 프레임 간격(22ms)을 쪼개 판정을 흐리지 않는다', () => {
    __resetCanvasQualityForTests();
    let now = 1000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const state = { frame: 0, over: false } as GameState;
    const stateRef = { current: state };
    const drawRef: { current: (() => void) | null } = { current: null };
    const effectsRef = { current: null };
    const skins = [
      { block: 'default', effect: 'default', board: 'default', levels: L1 },
      { block: 'default', effect: 'default', board: 'neon', levels: L1 },
    ];
    const { rerender } = render(<TetrisCanvas stateRef={stateRef} drawRef={drawRef} effectsRef={effectsRef} skins={skins[0]} />);
    try {
      for (let i = 0; i < 300; i++) {
        // 화면 프레임 사이 한가운데에서 스킨이 바뀌어 다시 그린다
        now += 11;
        state.frame++;
        rerender(<TetrisCanvas stateRef={stateRef} drawRef={drawRef} effectsRef={effectsRef} skins={skins[(i + 1) % 2]} />);
        now += 11;
        state.frame++;
        drawRef.current?.();
      }
      expect(drawGame.mock.lastCall?.[3].quality).toBe('lite');
    } finally {
      clock.mockRestore();
    }
  });
});

describe('TetrisCanvas 보드 스킨 (D-003)', () => {
  it('판 주인 스킨을 drawGame에 넘기고, 스킨이 바뀌면 멈춘 화면도 다시 그린다 — 값이 같은 새 객체면 다시 그리지 않는다', () => {
    const stateRef = { current: { frame: 3, over: false } as GameState };
    const drawRef: { current: (() => void) | null } = { current: null };
    const skins = { block: 'neon', effect: 'default', board: 'gameboy', levels: L1 };
    const { rerender } = render(<TetrisCanvas stateRef={stateRef} drawRef={drawRef} skins={skins} />);
    expect(drawGame.mock.lastCall?.[3]).toMatchObject({ skins });
    const before = drawGame.mock.calls.length;
    rerender(<TetrisCanvas stateRef={stateRef} drawRef={drawRef} skins={{ ...skins }} />);
    drawRef.current?.();
    expect(drawGame.mock.calls.length).toBe(before);
    rerender(<TetrisCanvas stateRef={stateRef} drawRef={drawRef} skins={{ ...skins, board: 'high-contrast' }} />);
    expect(drawGame.mock.calls.length).toBe(before + 1);
    expect(drawGame.mock.lastCall?.[3]).toMatchObject({ skins: { board: 'high-contrast' } });
  });

  it('레벨이 바뀌어도 다시 그린다(skin-levels) — 값이 같은 새 레벨 객체면 다시 그리지 않는다', () => {
    const stateRef = { current: { frame: 3, over: false } as GameState };
    const drawRef: { current: (() => void) | null } = { current: null };
    const skins = { block: 'neon', effect: 'default', board: 'gameboy', levels: L1 };
    const { rerender } = render(<TetrisCanvas stateRef={stateRef} drawRef={drawRef} skins={skins} />);
    const before = drawGame.mock.calls.length;
    rerender(<TetrisCanvas stateRef={stateRef} drawRef={drawRef} skins={{ ...skins, levels: { ...L1 } }} />);
    expect(drawGame.mock.calls.length).toBe(before);
    rerender(<TetrisCanvas stateRef={stateRef} drawRef={drawRef} skins={{ ...skins, levels: { ...L1, block: 4 } }} />);
    expect(drawGame.mock.calls.length).toBe(before + 1);
    expect(drawGame.mock.lastCall?.[3]).toMatchObject({ skins: { levels: { block: 4 } } });
  });
});
