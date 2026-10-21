/**
 * 맵(밀리타일) → 화면(CSS px) 변환 — 세로 9×15 맵을 비율 유지로 가운데 맞춘다(레터박스, D-021)
 */

export type Viewport = {
  /** 컨테이너 CSS 크기 */
  width: number;
  height: number;
  /** CSS px / 밀리타일 */
  scale: number;
  offsetX: number;
  offsetY: number;
  /** 캔버스 백버퍼 배율 = min(devicePixelRatio, 상한) */
  dpr: number;
};

export function fitViewport(cssWidth: number, cssHeight: number, mapWidth: number, mapHeight: number, devicePixelRatio: number, dprCap: number): Viewport {
  const scale = Math.max(0, Math.min(cssWidth / mapWidth, cssHeight / mapHeight));
  return {
    width: cssWidth,
    height: cssHeight,
    scale,
    offsetX: (cssWidth - mapWidth * scale) / 2,
    offsetY: (cssHeight - mapHeight * scale) / 2,
    dpr: Math.max(1, Math.min(devicePixelRatio || 1, dprCap)),
  };
}

/** 캔버스 백버퍼 픽셀 크기 */
export function backingSize(viewport: Viewport): { width: number; height: number } {
  return { width: Math.round(viewport.width * viewport.dpr), height: Math.round(viewport.height * viewport.dpr) };
}

export const toScreenX = (viewport: Viewport, x: number) => viewport.offsetX + x * viewport.scale;
export const toScreenY = (viewport: Viewport, y: number) => viewport.offsetY + y * viewport.scale;
