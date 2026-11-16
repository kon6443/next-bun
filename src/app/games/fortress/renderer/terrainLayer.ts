/**
 * 지형 레이어 — 월드 크기(2048×1024) 오프스크린 캔버스 1장에 열 구간을 칠해 두고, 폭발로 바뀐 열 범위만 다시 칠한다
 * 매 프레임은 이 캔버스를 카메라 변환으로 drawImage 한 번 (지형 전체를 다시 그리지 않는다)
 */

import { type MapId, type Terrain, WORLD_HEIGHT, WORLD_WIDTH } from "../engine";
import { type WorldPaint, bakeGroundTile, paintColumnWorld, worldTheme } from "./vividWorld";

/** world — 지형 칠(맵 테마·외곽선·파인 단면, renderer/vividWorld) */
export type TerrainLayer = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; world: WorldPaint };

export function createTerrainLayer(opts: { mapId?: MapId } = {}): TerrainLayer | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = WORLD_WIDTH;
  canvas.height = WORLD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const theme = worldTheme(opts.mapId);
  const deep = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  deep.addColorStop(0, theme.ground.deep[0]);
  deep.addColorStop(1, theme.ground.deep[1]);
  return { canvas, ctx, world: { theme, ground: bakeGroundTile(ctx, theme), deep, origTop: null } };
}

/** [x0, x1] 열을 지우고 다시 칠한다 — 맵 테마 흙·겉흙·풀, 외곽선, 파인 단면(renderer/vividWorld paintColumnWorld) */
export function paintColumns(layer: TerrainLayer, terrain: Terrain, x0: number, x1: number): void {
  const { ctx } = layer;
  // 벽 외곽선이 옆 열을 보므로 한 열씩 더 다시 칠한다
  const from = Math.max(0, x0 - 1);
  const to = Math.min(WORLD_WIDTH - 1, x1 + 1);
  ctx.clearRect(from, 0, to - from + 1, WORLD_HEIGHT);
  for (let x = from; x <= to; x++) paintColumnWorld(ctx, layer.world, x, terrain.cols[x], terrain.cols[x - 1], terrain.cols[x + 1], WORLD_HEIGHT);
}

/**
 * 전체를 다시 칠한다. origin = 경기 시작 때 지형 — 시안은 그 지표면보다 낮아진 면을 "파인 면"(그을린 흙)으로 칠한다
 * origin이 없으면 처음 칠할 때의 지형을 기준으로 삼는다(이후 다시 칠해도 기준은 그대로)
 */
export function paintAll(layer: TerrainLayer, terrain: Terrain, origin?: Terrain): void {
  if (origin || !layer.world.origTop) layer.world.origTop = Int16Array.from((origin ?? terrain).cols, (c) => c[0] ?? WORLD_HEIGHT);
  paintColumns(layer, terrain, 0, WORLD_WIDTH - 1);
}

/** 그을린 자국 — 막 파인 구덩이 둘레의 흙만 어둡게(빈 곳에는 칠하지 않는다). 그 열을 다시 칠하면 사라진다(연출용) */
export function scorch(layer: TerrainLayer, x: number, y: number, r: number): void {
  const { ctx } = layer;
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  const g = ctx.createRadialGradient(x, y, Math.max(0, r - 4), x, y, r + 14);
  g.addColorStop(0, "rgba(20, 12, 6, 0.75)");
  g.addColorStop(1, "rgba(20, 12, 6, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r + 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
