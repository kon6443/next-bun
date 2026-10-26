// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { PIECE_CELLS, createGame } from '../engine';
import { drawBoardFrame } from './effectsRenderer';
import { __clearNeonSpritesForTests, drawNeonFrame, drawNeonGhost } from './neonSprites';
import { computeLayout, drawGame } from './renderer';

/** 그리기 기록 대역 — 속성 대입·메서드 호출을 순서대로 남긴다 */
type Log = { kind: 'set' | 'call'; name: string; args: unknown[] }[];
function recordingCtx(scale = 1, translateX = 0, translateY = 0) {
  const log: Log = [];
  const ctx: object = new Proxy(
    {},
    {
      get: (_, name) => {
        if (name === 'getTransform') return () => ({ a: scale, b: 0, c: 0, d: scale, e: translateX, f: translateY });
        if (name === 'measureText') return () => ({ width: 10 });
        return (...args: unknown[]) => {
          log.push({ kind: 'call', name: String(name), args });
          return { addColorStop() {} };
        };
      },
      set: (_, name, value) => {
        log.push({ kind: 'set', name: String(name), args: [value] });
        return true;
      },
    },
  );
  return { ctx: ctx as CanvasRenderingContext2D, log };
}

/** 스프라이트 캔버스마다 만든 ctx의 기록 */
const spriteLogs = new Map<HTMLCanvasElement, Log>();

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    const { ctx, log } = recordingCtx();
    spriteLogs.set(this, log);
    return ctx;
  } as unknown as HTMLCanvasElement['getContext']);
});

beforeEach(() => {
  __clearNeonSpritesForTests();
  spriteLogs.clear();
});

/** 흐림 값으로 구운 스프라이트를 가린다 — 칸 스프라이트(blockSprites)도 strokeRect를 쓴다 */
const bakedWith = (blur: number) => [...spriteLogs.values()].filter((l) => l.some((e) => e.kind === 'set' && e.name === 'shadowBlur' && e.args[0] === blur));
const drawn = (log: Log) => log.filter((e) => e.name === 'drawImage').map((e) => e.args[0] as HTMLCanvasElement);
const shadowSets = (log: Log) => log.filter((e) => e.kind === 'set' && e.name === 'shadowBlur' && e.args[0] !== 0);

/** 복사 기록 — 스프라이트를 장치 px 정수 자리에 1:1로 놓는다(drawImage(canvas, x, y), 변환은 잠시 단위 행렬) */
const blits = (log: Log) =>
  log
    .filter((e) => e.name === 'drawImage')
    .map((e) => {
      const [canvas, x, y, ...rest] = e.args as [HTMLCanvasElement, number, number, ...unknown[]];
      expect(rest).toHaveLength(0);
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
      return { canvas, x, y, w: canvas.width, h: canvas.height };
    });

/** 스프라이트 ctx에 건 굽는 변환(setTransform 인자) */
const bakeTransform = (canvas: HTMLCanvasElement) => spriteLogs.get(canvas)!.find((e) => e.name === 'setTransform')!.args as number[];

describe('판 테두리 네온 스프라이트 (a1)', () => {
  it('같은 색·흐림·크기·DPR이면 구운 띠를 다시 쓰고, 매 프레임 shadowBlur를 쓰지 않는다', () => {
    const { ctx, log } = recordingCtx(2);
    expect(drawNeonFrame(ctx, 10, 20, 302, 602, '#22d3ee', 14)).toBe(true);
    expect(drawNeonFrame(ctx, 10, 20, 302, 602, '#22d3ee', 14)).toBe(true);
    const images = drawn(log);
    expect(images).toHaveLength(8);
    expect(images.slice(4)).toEqual(images.slice(0, 4));
    expect(spriteLogs.size).toBe(4);
    expect(shadowSets(log)).toHaveLength(0);
    // 복사하는 동안만 변환을 풀고 되돌린다(클립·투명도·합성은 호출 쪽 것 그대로)
    const order = log.filter((e) => ['save', 'setTransform', 'drawImage', 'restore'].includes(e.name)).map((e) => e.name);
    expect(order.slice(0, 4)).toEqual(['save', 'setTransform', 'drawImage', 'restore']);
  });

  it('구울 때 원래 테두리와 같은 값(투명도·굵기·흐림·색)으로 strokeRect를 그린다', () => {
    const { ctx } = recordingCtx(2);
    drawNeonFrame(ctx, 10, 20, 302, 602, '#22d3ee', 14);
    for (const log of spriteLogs.values()) {
      const set = Object.fromEntries(log.filter((e) => e.kind === 'set').map((e) => [e.name, e.args[0]]));
      expect(set).toMatchObject({ globalAlpha: 0.85, lineWidth: 1.5, shadowBlur: 14, shadowColor: '#22d3ee', strokeStyle: '#22d3ee' });
      expect(log.find((e) => e.name === 'strokeRect')!.args).toEqual([0, 0, 302, 602]);
    }
  });

  it('띠 4개가 겹치지 않고 테두리 둘레를 덮으며, 테두리 모서리가 원래 장치 px 자리에 놓인다', () => {
    for (const [dpr, x, y] of [
      [2, 10, 20],
      [1.5, 11, 21],
    ]) {
      __clearNeonSpritesForTests();
      spriteLogs.clear();
      const { ctx, log } = recordingCtx(dpr);
      drawNeonFrame(ctx, x, y, 302, 602, '#22d3ee', 14);
      const [top, bottom, left, right] = blits(log);
      expect(top.x).toBe(left.x);
      expect(top.x + top.w).toBe(right.x + right.w);
      expect(left.y).toBe(top.y + top.h);
      expect(left.y + left.h).toBe(bottom.y);
      // 띠마다 테두리 왼쪽 위가 장치 px (x·dpr, y·dpr)에 오도록 구웠다
      for (const strip of [top, bottom, left, right]) {
        const [a, , , d, e, f] = bakeTransform(strip.canvas);
        expect([a, d]).toEqual([dpr, dpr]);
        expect(strip.x + e).toBeCloseTo(x * dpr);
        expect(strip.y + f).toBeCloseTo(y * dpr);
      }
      // 흐림이 번지는 폭(가우스 3σ = 1.5 × blur) + 선 굵기까지 바깥·안쪽을 덮는다 — 모자라면 띠 경계에서 빛이 잘린다
      const reach = 1.5 * 14 + 1.5 * dpr;
      expect(top.x).toBeLessThanOrEqual(x * dpr - reach);
      expect(top.y).toBeLessThanOrEqual(y * dpr - reach);
      expect(bottom.y + bottom.h).toBeGreaterThanOrEqual((y + 602) * dpr + reach);
      expect(right.x + right.w).toBeGreaterThanOrEqual((x + 302) * dpr + reach);
      expect(top.y + top.h).toBeGreaterThanOrEqual(y * dpr + reach);
    }
  });

  it('레벨·스킨 색, 연출 줄이기(흐림), 판 크기(computeLayout 결과), DPR 중 하나라도 바뀌면 새로 굽는다 — 이전 것을 쓰지 않는다', () => {
    const images: HTMLCanvasElement[] = [];
    const variants: [number, number, string, number, number][] = [
      [302, 602, '#22d3ee', 14, 2],
      [302, 602, '#a855f7', 14, 2],
      [302, 602, '#22d3ee', 4, 2],
      [252, 502, '#22d3ee', 14, 2],
      [302, 602, '#22d3ee', 14, 1],
    ];
    for (const [w, h, color, blur, dpr] of variants) {
      const { ctx, log } = recordingCtx(dpr);
      drawNeonFrame(ctx, 0, 0, w, h, color, blur);
      images.push(...drawn(log));
    }
    expect(new Set(images).size).toBe(variants.length * 4);
  });

  it('장치 px 소수 위치(DPR 1.5에서 홀수 CSS px)가 다르면 따로 굽고, 같으면 다시 쓴다 — 흔들려도 보간하지 않는다', () => {
    const { ctx, log } = recordingCtx(1.5);
    drawNeonFrame(ctx, 10, 20, 302, 602, '#22d3ee', 14); // 15, 30 — 소수 0
    drawNeonFrame(ctx, 12, 22, 302, 602, '#22d3ee', 14); // 18, 33 — 소수 0
    drawNeonFrame(ctx, 11, 20, 302, 602, '#22d3ee', 14); // 16.5 — 소수 0.5
    const images = drawn(log);
    expect(images.slice(4, 8)).toEqual(images.slice(0, 4));
    expect(new Set(images).size).toBe(8);
  });

  it('흔들림 등으로 변환이 옮겨져 있어도 그 자리에 놓는다', () => {
    const { ctx, log } = recordingCtx(2, 6, -4);
    drawNeonFrame(ctx, 10, 20, 302, 602, '#22d3ee', 14);
    const [top] = blits(log);
    const [, , , , e, f] = bakeTransform(top.canvas);
    expect(top.x + e).toBe(10 * 2 + 6);
    expect(top.y + f).toBe(20 * 2 - 4);
  });

  it('판 테두리(drawBoardFrame)는 보드 스킨이 바뀌면 그 스킨 색으로 바로 그린다', async () => {
    const { boardSkin } = await import('./skins');
    const layout = computeLayout(400, 800);
    const { ctx, log } = recordingCtx(2);
    drawBoardFrame(ctx, layout, layout.cell * 10, layout.cell * 20, 1, false, boardSkin('default'));
    drawBoardFrame(ctx, layout, layout.cell * 10, layout.cell * 20, 1, false, boardSkin('high-contrast'));
    const colors = [...spriteLogs.values()].map((l) => l.find((e) => e.name === 'strokeStyle')?.args[0]);
    expect(new Set(colors)).toEqual(new Set([boardSkin('default').levelNeon[0], boardSkin('high-contrast').levelNeon[0]]));
    expect(shadowSets(log)).toHaveLength(0);
  });
});

describe('고스트 네온 스프라이트 (a2)', () => {
  const T = PIECE_CELLS[5];

  it('블록·회전·색·칸 크기·DPR이 같으면 다시 쓰고, 하나라도 다르면 새로 굽는다', () => {
    const images: HTMLCanvasElement[] = [];
    const calls: [string, number, number, number, string, number][] = [
      ['5|0', 0, 0, 30, '#a855f7', 2],
      ['5|0', 50, 90, 30, '#a855f7', 2],
      ['5|1', 0, 0, 30, '#a855f7', 2],
      ['5|0', 0, 0, 30, '#ff0000', 2],
      ['5|0', 0, 0, 25, '#a855f7', 2],
      ['5|0', 0, 0, 30, '#a855f7', 1],
    ];
    for (const [key, x, y, cell, color, dpr] of calls) {
      const { ctx, log } = recordingCtx(dpr);
      drawNeonGhost(ctx, key, key === '5|0' ? T[0] : T[1], x, y, cell, color, 8);
      images.push(...drawn(log));
      expect(shadowSets(log)).toHaveLength(0);
    }
    expect(images[1]).toBe(images[0]);
    expect(new Set(images).size).toBe(5);
  });

  it('구운 외곽선의 칸 위치가 원래 경로와 같은 장치 px 자리에 놓인다(복사 위치 + 굽는 변환 + 스프라이트 안 좌표)', () => {
    for (const dpr of [2, 1.5]) {
      const { ctx, log } = recordingCtx(dpr);
      const cells = T[2];
      drawNeonGhost(ctx, '5|2', cells, 101, 201, 31, '#a855f7', 8);
      const [sprite] = blits(log);
      const [a, , , , e, f] = bakeTransform(sprite.canvas);
      const rects = spriteLogs.get(sprite.canvas)!.filter((entry) => entry.name === 'rect').map((entry) => entry.args as number[]);
      expect(rects).toHaveLength(4);
      rects.forEach(([rx, ry, rw, rh], i) => {
        // 원래 코드: rect(boardX + (state.x + dx) * cell + 1.5, rowToY(ghostY + dy) + 1.5, cell - 3, cell - 3) — 변환(dpr)으로 장치 px
        expect(sprite.x + e + a * rx).toBeCloseTo((101 + cells[i * 2] * 31 + 1.5) * dpr);
        expect(sprite.y + f + a * ry).toBeCloseTo((201 + cells[i * 2 + 1] * 31 + 1.5) * dpr);
        expect([rw, rh]).toEqual([28, 28]);
      });
      // 구운 칸이 스프라이트 안에 들어간다(흐림 여백 포함)
      const xs = rects.map(([rx]) => e + a * rx);
      expect(Math.min(...xs)).toBeGreaterThan(8);
      expect(Math.max(...xs) + 28 * a).toBeLessThan(sprite.w - 8);
    }
  });
});

describe('drawGame — 매 프레임 shadowBlur (a1·a2)', () => {
  it('연출이 없는 프레임은 full 품질에서도 shadowBlur를 쓰지 않는다(테두리·고스트는 스프라이트 복사)', () => {
    const state = createGame({ seed: 1, das: 10, arr: 2 });
    const { ctx, log } = recordingCtx(2);
    drawGame(ctx, state, computeLayout(400, 800), { quality: 'full' });
    expect(shadowSets(log)).toHaveLength(0);
  });

  it('lite 품질·연출 줄이기도 shadowBlur 없이 그린다(고스트는 원래대로 흐림 0의 직접 선)', () => {
    const state = createGame({ seed: 1, das: 10, arr: 2 });
    for (const options of [{ quality: 'lite' as const }, { reduced: true }]) {
      const { ctx, log } = recordingCtx(2);
      drawGame(ctx, state, computeLayout(400, 800), options);
      expect(shadowSets(log)).toHaveLength(0);
      expect(log.some((e) => e.name === 'stroke')).toBe(true);
    }
  });

  it('스킨을 바꾸면 고스트도 바로 새 블록 색으로 굽는다', async () => {
    const { blockSkin } = await import('./skins');
    const state = createGame({ seed: 1, das: 10, arr: 2 });
    const layout = computeLayout(400, 800);
    const ghostColors = () =>
      bakedWith(8).map((l) => l.find((e) => e.name === 'strokeStyle')?.args[0]);
    drawGame(recordingCtx(2).ctx, state, layout, { quality: 'full', skins: { block: 'default', effect: 'default', board: 'default' } });
    drawGame(recordingCtx(2).ctx, state, layout, { quality: 'full', skins: { block: 'neon', effect: 'default', board: 'default' } });
    expect(ghostColors()).toEqual([blockSkin('default').cells[state.piece + 1], blockSkin('neon').cells[state.piece + 1]]);
  });

  it('layout(computeLayout 결과)이 바뀌면 테두리·고스트 모두 새 크기로 굽는다', () => {
    const state = createGame({ seed: 1, das: 10, arr: 2 });
    drawGame(recordingCtx(2).ctx, state, computeLayout(400, 800), { quality: 'full' });
    expect([bakedWith(14).length, bakedWith(8).length]).toEqual([4, 1]);
    drawGame(recordingCtx(2).ctx, state, computeLayout(400, 800), { quality: 'full' });
    expect([bakedWith(14).length, bakedWith(8).length]).toEqual([4, 1]);
    // 판 크기가 바뀌면 테두리 띠 4개·고스트 1개를 새 크기로 더 굽는다
    drawGame(recordingCtx(2).ctx, state, computeLayout(300, 600), { quality: 'full' });
    expect([bakedWith(14).length, bakedWith(8).length]).toEqual([8, 2]);
  });
});

describe('스프라이트 캐시·굽기 예산 (리뷰 S1·S2)', () => {
  const T = PIECE_CELLS[5];

  it('고스트도 장치 px 소수 위치(DPR 1.5에서 홀수 CSS px)마다 따로 굽는다', () => {
    const { ctx, log } = recordingCtx(1.5);
    drawNeonGhost(ctx, '5|0', T[0], 10, 20, 31, '#a855f7', 8);
    drawNeonGhost(ctx, '5|0', T[0], 12, 20, 31, '#a855f7', 8);
    drawNeonGhost(ctx, '5|0', T[0], 11, 20, 31, '#a855f7', 8);
    const images = drawn(log);
    expect(images[1]).toBe(images[0]);
    expect(images[2]).not.toBe(images[0]);
  });

  it('1초에 굽기 예산(8번)을 넘으면 굽지 않고 false — 호출 쪽이 직접 그린다(소수 DPR에서 흔들릴 때 옛 방식보다 느려지지 않게)', () => {
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const { ctx } = recordingCtx(1);
      const results = Array.from({ length: 10 }, (_, i) => drawNeonFrame(ctx, 0, 0, 300 + i, 600, '#22d3ee', 14));
      expect(results).toEqual([true, true, true, true, true, true, true, true, false, false]);
      // 이미 구운 것은 예산과 무관하게 쓴다
      expect(drawNeonFrame(ctx, 0, 0, 300, 600, '#22d3ee', 14)).toBe(true);
      now = 1000;
      expect(drawNeonFrame(ctx, 0, 0, 309, 600, '#22d3ee', 14)).toBe(true);
    } finally {
      clock.mockRestore();
    }
  });

  it('상한이 차면 가장 오래 안 쓴 것부터 버리고 그 캔버스 메모리를 돌려준다 — 방금 쓴 것은 남는다', () => {
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => (now += 1000));
    try {
      const { ctx, log } = recordingCtx(1);
      for (let i = 0; i < 8; i++) drawNeonFrame(ctx, 0, 0, 300 + i, 600, '#22d3ee', 14);
      const first = drawn(log).slice(0, 4);
      const second = drawn(log).slice(4, 8);
      drawNeonFrame(ctx, 0, 0, 300, 600, '#22d3ee', 14); // 첫 항목을 다시 쓴다 → 가장 최근
      drawNeonFrame(ctx, 0, 0, 400, 600, '#22d3ee', 14); // 상한(8)을 넘는 새 항목 → 둘째 항목이 밀려난다
      expect(second.every((c) => c.width === 0 && c.height === 0)).toBe(true);
      expect(first.every((c) => c.width > 0)).toBe(true);
      const before = log.length;
      drawNeonFrame(ctx, 0, 0, 300, 600, '#22d3ee', 14);
      expect(drawn(log.slice(before))).toEqual(first);
    } finally {
      clock.mockRestore();
    }
  });

  it('예산을 넘기면 drawGame은 테두리·고스트를 원래 값(투명도 0.85·흐림 14·8)으로 직접 그린다', () => {
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => 0);
    try {
      const { ctx: warm } = recordingCtx(1);
      for (let i = 0; i < 8; i++) drawNeonFrame(warm, 0, 0, 100 + i, 600, '#22d3ee', 14);
      const state = createGame({ seed: 1, das: 10, arr: 2 });
      const { ctx, log } = recordingCtx(2);
      drawGame(ctx, state, computeLayout(400, 800), { quality: 'full' });
      expect(drawn(log).some((c) => spriteLogs.get(c)?.some((e) => e.name === 'shadowBlur'))).toBe(false);
      const blurs = shadowSets(log).map((e) => e.args[0]);
      expect(blurs).toEqual(expect.arrayContaining([14, 8]));
      expect(log.some((e) => e.kind === 'set' && e.name === 'globalAlpha' && e.args[0] === 0.85)).toBe(true);
    } finally {
      clock.mockRestore();
    }
  });

  it('캔버스를 못 만들면(메모리 한도) 그 뒤로는 굽지 않는다 — 매 프레임 다시 만들어 보지 않게', () => {
    const getContext = vi.mocked(HTMLCanvasElement.prototype.getContext);
    getContext.mockImplementationOnce(() => null);
    const { ctx } = recordingCtx(1);
    expect(drawNeonFrame(ctx, 0, 0, 300, 600, '#22d3ee', 14)).toBe(false);
    const made = spriteLogs.size;
    expect(drawNeonFrame(ctx, 0, 0, 300, 600, '#22d3ee', 14)).toBe(false);
    expect(drawNeonGhost(ctx, '5|0', T[0], 0, 0, 30, '#a855f7', 8)).toBe(false);
    expect(spriteLogs.size).toBe(made);
  });
});
