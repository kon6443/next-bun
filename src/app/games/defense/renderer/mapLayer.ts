import { COLORS } from './palette';
import type { RenderMap } from './renderView';
import { type Viewport, toScreenX, toScreenY } from './viewport';

/** 흙길 폭 0.8칸, 돌 받침 반지름 0.42칸 (밀리타일) */
const PATH_WIDTH = 800;
const SLOT_RADIUS = 420;

/**
 * 배경 캔버스 — 바닥·흙길·돌 받침. 스테이지 로드·리사이즈 때만 다시 그린다 (§F10 캔버스 2장 중 bg)
 */
export function drawMapLayer(ctx: CanvasRenderingContext2D, map: RenderMap, viewport: Viewport): void {
  const { scale, dpr } = viewport;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  const x0 = toScreenX(viewport, 0);
  const y0 = toScreenY(viewport, 0);
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(x0, y0, map.width * scale, map.height * scale);

  // 칸 격자 — 아주 옅게 (배치 감각용)
  ctx.strokeStyle = COLORS.groundGrid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1000; x < map.width; x += 1000) {
    ctx.moveTo(toScreenX(viewport, x), y0);
    ctx.lineTo(toScreenX(viewport, x), y0 + map.height * scale);
  }
  for (let y = 1000; y < map.height; y += 1000) {
    ctx.moveTo(x0, toScreenY(viewport, y));
    ctx.lineTo(x0 + map.width * scale, toScreenY(viewport, y));
  }
  ctx.stroke();

  // 흙길 — 테두리 위에 길
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [color, width] of [
    [COLORS.pathEdge, PATH_WIDTH * 1.15],
    [COLORS.path, PATH_WIDTH],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width * scale;
    ctx.beginPath();
    for (const points of map.groundPaths) {
      for (let i = 0; i < points.length; i += 2) {
        const sx = toScreenX(viewport, points[i]);
        const sy = toScreenY(viewport, points[i + 1]);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
    }
    ctx.stroke();
  }

  // 돌 받침
  ctx.fillStyle = COLORS.slot;
  ctx.strokeStyle = COLORS.slotEdge;
  ctx.lineWidth = Math.max(1, 60 * scale);
  ctx.beginPath();
  for (const slot of map.slots) {
    const sx = toScreenX(viewport, slot.x);
    const sy = toScreenY(viewport, slot.y);
    ctx.moveTo(sx + SLOT_RADIUS * scale, sy);
    ctx.arc(sx, sy, SLOT_RADIUS * scale, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
}
