/**
 * 지형 레이어 — 월드 크기(2048×1024) 오프스크린 캔버스 1장에 열 구간을 칠해 두고, 폭발로 바뀐 열 범위만 다시 칠한다
 * 매 프레임은 이 캔버스를 카메라 변환으로 drawImage 한 번 (지형 전체를 다시 그리지 않는다)
 */

import { type MapId, type Terrain, WORLD_HEIGHT, WORLD_WIDTH } from "../engine";
import { type WorldPaint, bakeGroundTile, paintColumnWorld, worldTheme } from "./vividWorld";

const GRASS_LIGHT = "#a3e635";
const GRASS = "#4d7c0f";
const TOPSOIL = "rgba(146, 98, 52, 0.55)";
const UNDERSIDE = "#2b1a0e";
const GRASS_PX = 5;
const TOPSOIL_PX = 14;

/** world — 시안 "vivid"·"glow"의 지형 칠(맵 테마·외곽선·파인 단면, renderer/vividWorld). 없으면 기본 칠 */
export type TerrainLayer = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; dirt: CanvasPattern | string; depth: CanvasGradient; world?: WorldPaint };

/** 흙 무늬 — 가로 지층 띠 + 자갈 점(고정 식 의사난수). 레이어 원점 기준으로 깔려 파인 자리도 같은 무늬가 이어진다 */
function bakeDirt(ctx: CanvasRenderingContext2D): CanvasPattern | string {
  const tile = document.createElement("canvas");
  tile.width = 128;
  tile.height = 128;
  const t = tile.getContext("2d");
  if (!t) return "#6b4a28";
  const bands = ["#6f4c2a", "#654426", "#76522e", "#5f4024"];
  for (let y = 0; y < 128; y += 16) {
    t.fillStyle = bands[(y / 16) % bands.length];
    t.fillRect(0, y, 128, 16);
  }
  const rand = (i: number) => {
    const s = Math.sin(i * 91.7 + 13.3) * 43758.5453;
    return s - Math.floor(s);
  };
  for (let i = 0; i < 260; i++) {
    t.fillStyle = rand(i + 3) > 0.5 ? "rgba(30, 18, 8, 0.35)" : "rgba(180, 130, 80, 0.25)";
    const size = rand(i + 7) > 0.85 ? 3 : rand(i + 7) > 0.5 ? 2 : 1;
    t.fillRect(Math.floor(rand(i) * 128), Math.floor(rand(i + 1) * 128), size, size);
  }
  return ctx.createPattern(tile, "repeat") ?? "#6b4a28";
}

export function createTerrainLayer(opts: { vivid?: boolean; mapId?: MapId } = {}): TerrainLayer | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = WORLD_WIDTH;
  canvas.height = WORLD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // 깊을수록 어둡게 — 월드 높이 기준 한 장
  const depth = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  depth.addColorStop(0, "rgba(10, 6, 3, 0)");
  depth.addColorStop(0.55, "rgba(10, 6, 3, 0.25)");
  depth.addColorStop(1, "rgba(10, 6, 3, 0.6)");
  let world: WorldPaint | undefined;
  if (opts.vivid) {
    const theme = worldTheme(opts.mapId);
    const deep = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
    deep.addColorStop(0, theme.ground.deep[0]);
    deep.addColorStop(1, theme.ground.deep[1]);
    world = { theme, ground: bakeGroundTile(ctx, theme), deep, origTop: null };
  }
  return { canvas, ctx, dirt: bakeDirt(ctx), depth, world };
}

/**
 * [x0, x1] 열을 지우고 다시 칠한다 — 구간마다 흙 무늬 + 깊이 그늘, 위쪽 top에 겉흙·풀 띠(파인 구덩이 바닥도 풀이 되어 윤곽이 보인다),
 * 구간 아래 끝(동굴 천장·돌출부 밑면)은 어두운 선
 */
export function paintColumns(layer: TerrainLayer, terrain: Terrain, x0: number, x1: number): void {
  const { ctx } = layer;
  // 시안 — 벽 외곽선이 옆 열을 보므로 한 열씩 더 다시 칠한다
  const pad = layer.world ? 1 : 0;
  const from = Math.max(0, x0 - pad);
  const to = Math.min(WORLD_WIDTH - 1, x1 + pad);
  ctx.clearRect(from, 0, to - from + 1, WORLD_HEIGHT);
  if (layer.world) {
    for (let x = from; x <= to; x++) paintColumnWorld(ctx, layer.world, x, terrain.cols[x], terrain.cols[x - 1], terrain.cols[x + 1], WORLD_HEIGHT);
    return;
  }
  for (let x = from; x <= to; x++) {
    const col = terrain.cols[x];
    for (let i = 0; i < col.length; i += 2) {
      const top = col[i];
      const bottom = col[i + 1];
      const h = bottom - top;
      ctx.fillStyle = layer.dirt;
      ctx.fillRect(x, top, 1, h);
      ctx.fillStyle = layer.depth;
      ctx.fillRect(x, top, 1, h);
      ctx.fillStyle = TOPSOIL;
      ctx.fillRect(x, top, 1, Math.min(TOPSOIL_PX, h));
      ctx.fillStyle = GRASS;
      ctx.fillRect(x, top, 1, Math.min(GRASS_PX, h));
      ctx.fillStyle = GRASS_LIGHT;
      ctx.fillRect(x, top, 1, Math.min(2, h));
      if (bottom < WORLD_HEIGHT && h > 3) {
        ctx.fillStyle = UNDERSIDE;
        ctx.fillRect(x, bottom - 2, 1, 2);
      }
    }
  }
}

/**
 * 전체를 다시 칠한다. origin = 경기 시작 때 지형 — 시안은 그 지표면보다 낮아진 면을 "파인 면"(그을린 흙)으로 칠한다
 * origin이 없으면 처음 칠할 때의 지형을 기준으로 삼는다(이후 다시 칠해도 기준은 그대로)
 */
export function paintAll(layer: TerrainLayer, terrain: Terrain, origin?: Terrain): void {
  if (layer.world && (origin || !layer.world.origTop)) layer.world.origTop = Int16Array.from((origin ?? terrain).cols, (c) => c[0] ?? WORLD_HEIGHT);
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
