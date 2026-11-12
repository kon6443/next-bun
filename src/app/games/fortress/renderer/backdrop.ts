/**
 * 배경 — 하늘(노을 그라데이션·별·달) → 먼 산·가까운 산(패럴랙스, 가로로 이어 붙는 타일) → 구름(바람 따라 흐름) → 바람 줄기(화면 공간)
 * 지형·탱크보다 먼저, 화면 좌표(CSS px)로 그린다. 산·구름 모양은 처음 한 번 오프스크린 캔버스에 구워 두고 매 프레임 drawImage만 한다
 * 연출 전용 — 무작위는 Math.random이 아니라 고정 식(sin 합)이라 매번 같은 그림이다
 */

import { WIND_MAX } from "../engine";
import type { Camera, ViewSize } from "./camera";

export type Quality = "high" | "low";

export type BackdropOptions = {
  /** 경과 시간(ms) — 구름·바람 줄기·별 반짝임 */
  time: number;
  wind: number;
  quality: Quality;
  reducedMotion: boolean;
};

const TILE_W = 1024;
const FAR_H = 300;
const NEAR_H = 260;

type Layers = { far: HTMLCanvasElement; near: HTMLCanvasElement; cloud: HTMLCanvasElement };
let layers: Layers | null = null;

/** 타일 양 끝이 이어지도록 정수 주기 사인 합으로 능선 높이 */
function ridge(x: number, cycles: readonly [number, number, number], amps: readonly [number, number, number], phase: number): number {
  const t = (x / TILE_W) * Math.PI * 2;
  return amps[0] * Math.sin(t * cycles[0] + phase) + amps[1] * Math.sin(t * cycles[1] + phase * 2.3) + amps[2] * Math.sin(t * cycles[2] + phase * 0.7);
}

function bakeMountains(height: number, top: string, bottom: string, base: number, cycles: readonly [number, number, number], amps: readonly [number, number, number], phase: number, snow: boolean): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_W;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let x = 0; x <= TILE_W; x += 4) ctx.lineTo(x, base - ridge(x, cycles, amps, phase));
  ctx.lineTo(TILE_W, height);
  ctx.closePath();
  ctx.fill();
  if (snow) {
    // 봉우리 끝을 살짝 밝게 — 능선 바로 아래 6px 띠
    ctx.strokeStyle = "rgba(203, 213, 225, 0.1)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= TILE_W; x += 4) {
      const y = base - ridge(x, cycles, amps, phase) + 2;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return canvas;
}

/** 구름 — 원 여러 개를 합친 윤곽 + 위는 밝고 아래는 어두운 2톤, 바닥은 평평하게(일러스트 느낌, 흐린 번짐 없음) */
function bakeCloud(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 220;
  canvas.height = 90;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const puffs: [number, number, number][] = [
    [52, 58, 24],
    [88, 44, 32],
    [130, 40, 28],
    [166, 54, 22],
    [110, 60, 26],
  ];
  const shape = () => {
    ctx.beginPath();
    for (const [x, y, r] of puffs) {
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  };
  ctx.save();
  // 바닥선 아래는 자른다 — 평평한 밑면
  ctx.beginPath();
  ctx.rect(0, 0, 220, 70);
  ctx.clip();
  shape();
  const g = ctx.createLinearGradient(0, 14, 0, 70);
  g.addColorStop(0, "#f1f5f9");
  g.addColorStop(0.55, "#cbd5e1");
  g.addColorStop(1, "#7c86a8");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  // 밑면 그늘 띠
  ctx.fillStyle = "rgba(71, 85, 125, 0.55)";
  ctx.fillRect(34, 64, 152, 6);
  return canvas;
}

function getLayers(): Layers | null {
  if (layers) return layers;
  if (typeof document === "undefined") return null;
  layers = {
    far: bakeMountains(FAR_H, "#262c5c", "#171b3d", 170, [2, 5, 11], [55, 26, 9], 0.6, true),
    near: bakeMountains(NEAR_H, "#151a33", "#0c0f20", 150, [3, 7, 13], [42, 20, 8], 2.1, false),
    cloud: bakeCloud(),
  };
  return layers;
}

let skyCache: { h: number; grad: CanvasGradient; ctx: CanvasRenderingContext2D } | null = null;
function skyGradient(ctx: CanvasRenderingContext2D, height: number): CanvasGradient {
  if (skyCache && skyCache.h === height && skyCache.ctx === ctx) return skyCache.grad;
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, "#070b1d");
  grad.addColorStop(0.45, "#1d2252");
  grad.addColorStop(0.75, "#4a3a6e");
  grad.addColorStop(1, "#8a4f6a");
  skyCache = { h: height, grad, ctx };
  return grad;
}

/** 0~1 사이 고정 의사난수(정수 i) */
function hash01(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const STARS = 70;
const CLOUDS = 6;

export function drawBackdrop(ctx: CanvasRenderingContext2D, view: ViewSize, camera: Camera, opt: BackdropOptions): void {
  const { width, height } = view;
  ctx.fillStyle = skyGradient(ctx, height);
  ctx.fillRect(0, 0, width, height);

  const L = getLayers();
  const high = opt.quality === "high";
  // 하늘이 보이는 만큼(카메라가 위로 갈수록) 별·달을 아래로 — 배경은 카메라를 아주 느리게 따라간다
  const skyShift = -(camera.cy - 400) * camera.zoom * 0.08;

  // 별 — 화면 위쪽 절반, 반짝임은 움직임 줄이기면 끈다
  for (let i = 0; i < (high ? STARS : STARS / 2); i++) {
    const x = (hash01(i) * (width + 200) - camera.cx * camera.zoom * 0.02) % (width + 200);
    const y = hash01(i + 100) * height * 0.5 + skyShift;
    const twinkle = opt.reducedMotion ? 0.6 : 0.45 + 0.35 * Math.sin(opt.time / 700 + i * 1.7);
    ctx.fillStyle = `rgba(226, 232, 240, ${twinkle * (0.4 + hash01(i + 200) * 0.6)})`;
    ctx.fillRect(x < 0 ? x + width + 200 : x, y, hash01(i + 300) > 0.85 ? 2 : 1, hash01(i + 300) > 0.85 ? 2 : 1);
  }

  // 달 — 오른쪽 위, 은은한 빛무리
  const mx = width * 0.78 - camera.cx * camera.zoom * 0.03;
  const my = height * 0.16 + skyShift;
  const glow = ctx.createRadialGradient(mx, my, 6, mx, my, 70);
  glow.addColorStop(0, "rgba(254, 243, 199, 0.35)");
  glow.addColorStop(1, "rgba(254, 243, 199, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(mx - 70, my - 70, 140, 140);
  ctx.fillStyle = "#fde68a";
  ctx.beginPath();
  ctx.arc(mx, my, 13, 0, Math.PI * 2);
  ctx.fill();

  if (L) {
    drawTiled(ctx, L.far, view, camera, 0.18, 560, "#171b3d");
    if (high) drawTiled(ctx, L.near, view, camera, 0.38, 640, "#0c0f20");
    drawClouds(ctx, L.cloud, view, camera, opt);
  }
  if (!opt.reducedMotion) drawWindStreaks(ctx, view, opt);
}

/**
 * 산 타일 — 가로는 패럴랙스, 세로는 월드 높이 baseWorldY에 바닥을 맞춘다(지형 뒤에 서 있게, 멀수록 조금 덜 움직인다)
 * 크기도 배율을 따라가되 덜 변한다(멀리 있는 것)
 */
function drawTiled(ctx: CanvasRenderingContext2D, tile: HTMLCanvasElement, view: ViewSize, camera: Camera, parallax: number, baseWorldY: number, fill: string): void {
  const { width, height } = view;
  const scale = 0.45 + camera.zoom * 0.6;
  const w = tile.width * scale;
  const h = tile.height * scale;
  const baseY = height / 2 + (baseWorldY - camera.cy) * camera.zoom * (1 - parallax * 0.4);
  const y = baseY - h;
  let x = -((camera.cx * camera.zoom * parallax) % w);
  if (x > 0) x -= w;
  for (; x < width; x += w) ctx.drawImage(tile, x, y, w, h);
  // 산 아래(지형 뒤) 빈 하늘이 보이지 않게 아래를 같은 색으로 채운다
  ctx.fillStyle = fill;
  ctx.fillRect(0, y + h - 1, width, height - (y + h) + 2);
}

/** 구름 — 바람 방향·세기대로 흐른다(바람 0이면 아주 천천히 오른쪽) */
function drawClouds(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement, view: ViewSize, camera: Camera, opt: BackdropOptions): void {
  const span = view.width + 260;
  const speed = opt.reducedMotion ? 0 : (opt.wind === 0 ? 4 : opt.wind * 9);
  for (let i = 0; i < (opt.quality === "high" ? CLOUDS : 3); i++) {
    const depth = 0.5 + hash01(i + 400) * 0.6;
    const base = hash01(i + 500) * span - camera.cx * camera.zoom * 0.25 * depth + (opt.time / 1000) * speed * depth;
    const x = (((base % span) + span) % span) - 220;
    const y = view.height * (0.06 + hash01(i + 600) * 0.22) - (camera.cy - 400) * camera.zoom * 0.1;
    const s = 0.5 + depth * 0.5;
    ctx.globalAlpha = 0.16 + depth * 0.16;
    ctx.drawImage(sprite, x, y, sprite.width * s, sprite.height * s);
  }
  ctx.globalAlpha = 1;
}

/** 바람 줄기 — 화면을 가로지르는 가는 선. 개수·길이·속도가 세기에 비례, 바람 0이면 없다 */
function drawWindStreaks(ctx: CanvasRenderingContext2D, view: ViewSize, opt: BackdropOptions): void {
  const strength = Math.abs(opt.wind);
  if (strength === 0) return;
  const dir = opt.wind > 0 ? 1 : -1;
  const count = Math.round((opt.quality === "high" ? 6 : 3) + strength * (opt.quality === "high" ? 2.2 : 1));
  const len = 24 + strength * 7;
  const speed = 140 + strength * 55;
  const span = view.width + len * 2;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    const phase = hash01(i + 700) * span;
    const travel = ((opt.time / 1000) * speed * (0.7 + hash01(i + 800) * 0.6) + phase) % span;
    const x = dir > 0 ? travel - len : view.width + len - travel;
    const y = view.height * (0.08 + hash01(i + 900) * 0.62) + Math.sin(opt.time / 600 + i) * 4;
    const a = 0.12 + (strength / WIND_MAX) * 0.22;
    const grad = ctx.createLinearGradient(x, y, x + dir * len, y);
    grad.addColorStop(0, "rgba(186, 230, 253, 0)");
    grad.addColorStop(1, `rgba(186, 230, 253, ${a})`);
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dir * len, y);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}
