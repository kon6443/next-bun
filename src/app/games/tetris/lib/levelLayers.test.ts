import { beforeEach, describe, expect, it, vi } from 'vitest';

const layers = vi.hoisted(() => ({
  drawBlockShine: vi.fn(),
  drawBlockTwinkles: vi.fn(),
  drawBoardLevelLayer: vi.fn(),
  drawClearSparks: vi.fn(),
}));
vi.mock('./levelLayers', async (importOriginal) => ({ ...(await importOriginal<typeof import('./levelLayers')>()), ...layers }));

import { createGame } from '../engine';
import { frameBlur, glowBoost, starDensity, withAlpha } from './levelLayers';
import { computeLayout, drawGame } from './renderer';
import { toBoardSkins } from './skins';

/** 아무것도 그리지 않는 캔버스 대역 — 그리기 호출은 levelLayers 대역으로 센다 */
function nullCtx(): CanvasRenderingContext2D {
  const ctx: object = new Proxy(
    {},
    {
      get: (_, name) => {
        if (name === 'getTransform') return () => ({ a: 1 });
        if (name === 'measureText') return () => ({ width: 10 });
        return () => ({ addColorStop() {} });
      },
      set: () => true,
    },
  );
  return ctx as CanvasRenderingContext2D;
}

const skinsAt = (level: number) => toBoardSkins({ block: 'neon', effect: 'neon', board: 'neon', levels: { block: level, effect: level, board: level } });

beforeEach(() => {
  for (const fn of Object.values(layers)) fn.mockClear();
});

describe('스킨 레벨 레이어 — 렌더러 연결 (skin-levels)', () => {
  it('Lv5·고품질·게임 중 — 움직이는 강화(샤인·반짝임·불꽃)를 그리고 보드 레이어는 움직임 켬', () => {
    const state = createGame({ seed: 1, das: 10, arr: 2 });
    drawGame(nullCtx(), state, computeLayout(400, 800), { quality: 'full', skins: skinsAt(5) });
    expect(layers.drawBlockShine).toHaveBeenCalledTimes(1);
    expect(layers.drawBlockTwinkles).toHaveBeenCalledTimes(1);
    expect(layers.drawClearSparks).toHaveBeenCalledTimes(1);
    expect(layers.drawBoardLevelLayer.mock.lastCall?.slice(5, 8)).toEqual([5, state.frame, true]);
  });

  it.each([
    ['연출 줄이기', { reduced: true }],
    ['저사양(lite)', { quality: 'lite' as const }],
  ])('%s — 움직이는 강화는 그리지 않고 멈춘 보드 레이어만', (_name, options) => {
    const state = createGame({ seed: 1, das: 10, arr: 2 });
    drawGame(nullCtx(), state, computeLayout(400, 800), { quality: 'full', ...options, skins: skinsAt(5) });
    expect(layers.drawBlockShine).not.toHaveBeenCalled();
    expect(layers.drawBlockTwinkles).not.toHaveBeenCalled();
    expect(layers.drawClearSparks).not.toHaveBeenCalled();
    expect(layers.drawBoardLevelLayer.mock.lastCall?.[7]).toBe(false);
  });

  it('게임이 끝나면 움직이는 강화를 멈춘다', () => {
    const state = { ...createGame({ seed: 1, das: 10, arr: 2 }), over: true };
    drawGame(nullCtx(), state, computeLayout(400, 800), { quality: 'full', skins: skinsAt(5) });
    expect(layers.drawBlockShine).not.toHaveBeenCalled();
    expect(layers.drawBoardLevelLayer.mock.lastCall?.[7]).toBe(false);
  });

  it('Lv1 — 강화 없이 레벨 도입 전과 같은 값(샤인·반짝임·불꽃 없음, 발광·테두리·별 배율 1)', () => {
    const state = createGame({ seed: 1, das: 10, arr: 2 });
    drawGame(nullCtx(), state, computeLayout(400, 800), { quality: 'full', skins: skinsAt(1) });
    expect(layers.drawBlockShine).not.toHaveBeenCalled();
    expect(layers.drawBlockTwinkles).not.toHaveBeenCalled();
    expect(layers.drawClearSparks).not.toHaveBeenCalled();
    expect(glowBoost(1)).toBe(1);
    expect(frameBlur(1, false)).toBe(14);
    expect(frameBlur(1, true)).toBe(4);
    expect(starDensity(1)).toBe(1);
  });

  it('레벨별 배율 — 글로우는 Lv3부터 확실히(Lv5 더), 테두리 발광은 Lv3부터(연출 줄이기는 그대로), 별은 Lv5', () => {
    expect([1, 2, 3, 4, 5].map(glowBoost)).toEqual([1, 1, 1.7, 1.7, 2]);
    expect(frameBlur(3, false)).toBeGreaterThan(frameBlur(2, false));
    expect(frameBlur(5, true)).toBe(4);
    expect([4, 5].map(starDensity)).toEqual([1, 2]);
  });

  it('withAlpha — #rrggbb → rgba', () => {
    expect(withAlpha('#38bdf8', 0.3)).toBe('rgba(56, 189, 248, 0.3)');
  });
});
