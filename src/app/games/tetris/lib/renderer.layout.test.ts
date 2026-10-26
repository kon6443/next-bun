import { describe, expect, it } from 'vitest';
import { computeLayout } from './renderer';

// 판 영역은 실측값(Playwright, 싱글 플레이 — T자 십자·드롭 48·HUD 여백 2 적용 후)
describe('판 레이아웃 셀 크기 (D-004 S3 — 옆 패널 2.5칸)', () => {
  it.each([
    ['375×667', 375, 437.5, 19],
    ['390×664', 390, 430.6, 19],
    ['390×844 (폭이 한계 — 옆 패널 3칸이면 22)', 390, 610.6, 24],
  ])('%s', (_name, width, height, cell) => {
    expect(computeLayout(width, height).cell).toBe(cell);
  });

  it('옆 패널에 다음 블록 I(미니 칸 0.6 × 4)가 들어가고, 판·패널이 캔버스 안에 있다', () => {
    for (const [width, height] of [
      [375, 437.5],
      [390, 610.6],
      [320, 300],
      [1280, 900],
    ]) {
      const layout = computeLayout(width, height);
      expect(Math.floor(layout.cell * 0.6) * 4).toBeLessThanOrEqual(layout.sideWidth);
      expect(layout.boardX - layout.cell / 2 - layout.sideWidth).toBeGreaterThanOrEqual(0);
      expect(layout.boardX + layout.cell * 10 + layout.cell / 2 + layout.sideWidth).toBeLessThanOrEqual(width);
    }
  });
});
