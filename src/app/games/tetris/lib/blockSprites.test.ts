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
