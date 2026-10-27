// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { getBlockSprite, getGlowSprite } from './blockSprites';

beforeAll(() => {
  // jsdom에는 캔버스 2D가 없다 — 그리기는 아무것도 하지 않는 대역
  // 메서드는 자기 자신을 돌려준다(그라데이션의 addColorStop 등)
  const ctx: object = new Proxy({}, { get: () => () => ctx, set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as CanvasRenderingContext2D);
});

describe('블록 스프라이트 캐시 (games-polish FE-22 — 숫자 키)', () => {
  it('같은 칸·같은 픽셀 크기면 같은 캔버스를 다시 쓴다(크기×DPR이 같으면 같은 것)', () => {
    expect(getBlockSprite(3, 20, 1)).toBe(getBlockSprite(3, 20, 1));
    expect(getBlockSprite(3, 10, 2)).toBe(getBlockSprite(3, 20, 1));
  });

  it('칸 값·크기가 다르면 다른 캔버스 — 숫자 키가 겹치지 않는다(작은 크기의 큰 칸 값 vs 큰 크기의 작은 칸 값)', () => {
    const sprites = [getBlockSprite(8, 20, 1), getBlockSprite(0, 21, 1), getBlockSprite(1, 20, 1), getBlockSprite(8, 21, 1)];
    expect(new Set(sprites).size).toBe(4);
    expect(sprites[0]!.width).toBe(20);
    expect(sprites[1]!.width).toBe(21);
  });

  it('스킨이 다르면 다른 캔버스 — 같은 칸·크기여도 섞이지 않는다(판마다 주인 스킨)', () => {
    const skins = ['default', 'gameboy', 'neon', 'high-contrast'] as const;
    const blocks = skins.map((skin) => getBlockSprite(3, 20, 1, skin));
    const glows = skins.map((skin) => getGlowSprite(3, 20, 1, skin));
    expect(new Set(blocks).size).toBe(4);
    expect(new Set(glows).size).toBe(4);
    // 스킨을 생략하면 기본 스킨과 같은 것
    expect(getBlockSprite(3, 20, 1)).toBe(blocks[0]);
    expect(getGlowSprite(3, 20, 1)).toBe(glows[0]);
    // 다른 스킨을 그린 뒤에도 같은 스킨은 같은 것을 다시 쓴다
    expect(getBlockSprite(3, 20, 1, 'neon')).toBe(blocks[2]);
  });

  it('발광 스프라이트는 블록과 따로 — 같은 칸·크기여도 다른 캔버스', () => {
    expect(getGlowSprite(3, 20, 1)).not.toBe(getBlockSprite(3, 20, 1));
    expect(getGlowSprite(3, 20, 1)).toBe(getGlowSprite(3, 20, 1));
  });
});

describe('블록 스프라이트 — 스킨 레벨 (skin-levels)', () => {
  it('레벨이 다르면 다른 캔버스, 같으면 같은 것 — 생략·범위 밖은 Lv1(레벨 도입 전 그림)과 같다', () => {
    const levels = [1, 2, 3, 4, 5].map((level) => getBlockSprite(3, 20, 1, 'neon', level));
    expect(new Set(levels).size).toBe(5);
    expect(getBlockSprite(3, 20, 1, 'neon', 4)).toBe(levels[3]);
    expect(getBlockSprite(3, 20, 1, 'neon')).toBe(levels[0]);
    expect(getBlockSprite(3, 20, 1, 'neon', 0)).toBe(levels[0]);
    expect(getBlockSprite(3, 20, 1, 'neon', 9)).toBe(levels[0]);
  });

  it('새 아이템(투명·초콜릿)도 레벨마다 따로 굽는다 — 다른 스킨·레벨과 키가 겹치지 않는다', () => {
    const sprites = ['default', 'clear', 'chocolate'].flatMap((skin) => [1, 5].map((level) => getBlockSprite(3, 24, 2, skin, level)));
    expect(new Set(sprites).size).toBe(6);
  });
});
