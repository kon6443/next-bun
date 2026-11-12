/**
 * 시안 "vivid"의 세계 — 맵별 테마(배경·지형). 아트 규칙(tankArt와 같다):
 * - 광원은 왼쪽 위(해도 왼쪽 위) — 산 능선은 왼쪽을 보는 비탈에 빛, 지형 윗면에 밝은 띠
 * - 짙은 외곽선: 지형 윗면·벽·동굴 천장(2px), 산·구름은 옅은 외곽선
 * - 붓 질감: 지층은 부드러운 물결 띠 + 매끈한 자갈(픽셀 덩어리 없이 — 확대해도 탱크 그림과 같은 결)
 * hills: 맑은 낮 초원 · canyon: 노을 진 붉은 사암 협곡
 * 연출 전용, 고정 식 의사난수
 */

import { type MapId, WIND_MAX } from "../engine";
import type { BackdropOptions } from "./backdrop";
import type { Camera, ViewSize } from "./camera";

const TILE_W = 1024;

function hash01(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** shape — peak 뾰족한 산 · round 둥근 언덕 · mesa 평평한 윗면(협곡). fog — 대기 안개 세기(원경만 진하게, 가까운 층은 0 = 불투명 색면 + 윤곽선) */
type Range = { fog: number; top: string; bottom: string; haze: string; base: number; cycles: [number, number, number]; amps: [number, number, number]; phase: number; shape: "peak" | "round" | "mesa"; rim: string; parallax: number; worldY: number };

export type WorldTheme = {
  sky: [number, string][];
  sun: { x: number; y: number; core: string; glow: string; rays: number };
  cloud: { lit: string; mid: string; shade: string; alpha: number };
  ranges: [Range, Range, Range];
  ground: {
    bands: string[];
    deep: [string, string];
    ink: string;
    capLight: string;
    cap: string;
    capDark: string;
    exposed: string;
    pebble: string;
    grass: boolean;
    tuft: string;
  };
  motes: string;
  grade: { vignette: string; tint: string };
};

const HILLS: WorldTheme = {
  sky: [
    [0, "#3b86d0"],
    [0.45, "#79c1f0"],
    [0.8, "#c8ebff"],
    [1, "#fff2d8"],
  ],
  sun: { x: 0.18, y: 0.16, core: "#fffbea", glow: "255, 244, 200", rays: 0.07 },
  cloud: { lit: "#ffffff", mid: "#eef6ff", shade: "#b8d2ee", alpha: 1 },
  ranges: [
    { fog: 1, top: "#c3d4f0", bottom: "#9fb6dd", haze: "rgb(214, 232, 252)", base: 120, cycles: [3, 7, 13], amps: [46, 20, 7], phase: 0.6, shape: "peak", rim: "255, 255, 255", parallax: 0.12, worldY: 560 },
    { fog: 0.35, top: "#86b4cf", bottom: "#6394b4", haze: "rgb(186, 218, 238)", base: 110, cycles: [2, 5, 9], amps: [40, 18, 6], phase: 2.1, shape: "round", rim: "240, 250, 255", parallax: 0.24, worldY: 630 },
    { fog: 0, top: "#7dba5e", bottom: "#4b8642", haze: "rgb(160, 205, 168)", base: 100, cycles: [3, 6, 11], amps: [30, 14, 5], phase: 4.2, shape: "round", rim: "220, 255, 190", parallax: 0.4, worldY: 690 },
  ],
  ground: {
    bands: ["#8e5d37", "#7f512f", "#9a6843", "#71472a", "#875a3b", "#6a4227"],
    deep: ["rgba(40, 20, 12, 0)", "rgba(30, 14, 10, 0.62)"],
    ink: "#1a2412",
    capLight: "#b8ec74",
    cap: "#62bd40",
    capDark: "#2f7428",
    exposed: "#4e3220",
    pebble: "#a8876a",
    grass: true,
    tuft: "#7fd04f",
  },
  motes: "255, 255, 240",
  grade: { vignette: "rgba(10, 30, 50, 0.32)", tint: "rgba(255, 240, 200, 0.04)" },
};

const CANYON: WorldTheme = {
  sky: [
    [0, "#1c2452"],
    [0.32, "#59397a"],
    [0.6, "#c45d6c"],
    [0.82, "#f39c5c"],
    [1, "#ffd79c"],
  ],
  sun: { x: 0.22, y: 0.5, core: "#fff1d0", glow: "255, 196, 130", rays: 0.09 },
  cloud: { lit: "#ffe2bf", mid: "#f0a8a6", shade: "#9a6d9e", alpha: 1 },
  ranges: [
    { fog: 1, top: "#7d5f98", bottom: "#5c447a", haze: "rgb(242, 164, 122)", base: 190, cycles: [2, 5, 11], amps: [70, 30, 10], phase: 0.6, shape: "mesa", rim: "255, 210, 160", parallax: 0.12, worldY: 520 },
    { fog: 0.35, top: "#a8515c", bottom: "#7b3447", haze: "rgb(224, 128, 100)", base: 160, cycles: [3, 7, 13], amps: [56, 22, 9], phase: 2.1, shape: "mesa", rim: "255, 180, 130", parallax: 0.24, worldY: 600 },
    { fog: 0, top: "#62263a", bottom: "#3e1726", haze: "rgb(150, 64, 72)", base: 140, cycles: [4, 9, 17], amps: [40, 16, 7], phase: 4.2, shape: "mesa", rim: "255, 160, 110", parallax: 0.4, worldY: 670 },
  ],
  ground: {
    bands: ["#c8673c", "#b45734", "#d77d4a", "#a24b2d", "#c26c42", "#953f27"],
    deep: ["rgba(60, 10, 24, 0)", "rgba(40, 6, 20, 0.66)"],
    ink: "#2a110f",
    capLight: "#fbe0a6",
    cap: "#e6b46c",
    capDark: "#b37238",
    exposed: "#7c3622",
    pebble: "#b07a62",
    grass: false,
    tuft: "#7a7a3a",
  },
  motes: "255, 220, 170",
  grade: { vignette: "rgba(30, 8, 30, 0.42)", tint: "rgba(255, 150, 90, 0.05)" },
};

export function worldTheme(mapId: MapId | undefined): WorldTheme {
  return mapId === "canyon" ? CANYON : HILLS;
}

// ===== 배경 =====

function profile(r: Range, x: number): number {
  const t = (x / TILE_W) * Math.PI * 2;
  if (r.shape === "round") {
    // 둥근 언덕 — 사인 합(봉우리 없이)
    return r.amps[0] * (0.6 + 0.6 * Math.sin(t * r.cycles[0] + r.phase)) + r.amps[1] * 0.7 * Math.sin(t * r.cycles[1] + r.phase * 2.3) + r.amps[2] * 0.5 * Math.sin(t * r.cycles[2] + r.phase * 0.7);
  }
  const peak = (c: number, p: number) => Math.pow(1 - Math.abs(Math.sin(t * c + p)), 1.6);
  let h = r.amps[0] * 1.5 * peak(r.cycles[0], r.phase) + r.amps[1] * 1.1 * peak(r.cycles[1], r.phase * 2.3) + r.amps[2] * 0.6 * Math.sin(t * r.cycles[2] + r.phase * 0.7);
  if (r.shape === "mesa") {
    // 메사 — 높이를 잘라 평평한 윗면과 가파른 옆면
    const cap = r.amps[0] * 0.95;
    h = Math.min(cap, h * 1.6) + r.amps[2] * 0.25 * Math.sin(t * r.cycles[2] * 3 + r.phase);
  }
  return h;
}

function bakeRange(r: Range): HTMLCanvasElement {
  const height = r.base + r.amps[0] * 2.2 + 40;
  const canvas = document.createElement("canvas");
  canvas.width = TILE_W;
  canvas.height = Math.round(height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const ys: number[] = [];
  for (let x = 0; x <= TILE_W; x += 4) ys.push(height - r.base - profile(r, x));
  const path = new Path2D();
  path.moveTo(0, height);
  ys.forEach((y, i) => path.lineTo(i * 4, y));
  path.lineTo(TILE_W, height);
  path.closePath();
  const g = ctx.createLinearGradient(0, height - r.base - r.amps[0] * 1.6, 0, height);
  g.addColorStop(0, r.top);
  g.addColorStop(1, r.bottom);
  ctx.fillStyle = g;
  ctx.fill(path);
  // 왼쪽을 보는 비탈(오른쪽으로 오르는 곳) — 해가 왼쪽 위라 빛
  ctx.save();
  ctx.clip(path);
  for (let i = 1; i < ys.length; i++) {
    const rise = ys[i - 1] - ys[i];
    if (rise <= 0.3) continue;
    const gg = ctx.createLinearGradient(0, ys[i], 0, ys[i] + 40);
    gg.addColorStop(0, `rgba(${r.rim}, ${Math.min(0.5, 0.1 + rise * 0.12)})`);
    gg.addColorStop(1, `rgba(${r.rim}, 0)`);
    ctx.fillStyle = gg;
    ctx.fillRect((i - 1) * 4, ys[i], 4, 40);
  }
  // 아래 안개 — 대기 원근
  if (r.fog > 0) {
    const h = ctx.createLinearGradient(0, height * 0.3, 0, height);
    h.addColorStop(0, r.haze.replace("rgb", "rgba").replace(")", ", 0)"));
    h.addColorStop(1, r.haze.replace("rgb", "rgba").replace(")", `, ${r.fog})`));
    ctx.fillStyle = h;
    ctx.fillRect(0, 0, TILE_W, height);
  }
  ctx.restore();
  // 외곽선 — 가까운 층일수록 짙게(층이 분명히 나뉘게)
  ctx.strokeStyle = `rgba(20, 16, 40, ${0.5 - r.fog * 0.3})`;
  ctx.lineWidth = r.fog > 0.5 ? 2 : 3;
  ctx.beginPath();
  ctx.moveTo(0, ys[0]);
  for (let i = 1; i < ys.length; i++) ctx.lineTo(i * 4, ys[i]);
  ctx.stroke();
  return canvas;
}

/** 툰 구름 — 흰 몸통, 아래 그늘, 옅은 외곽선(빛은 왼쪽 위) */
function bakeCloud(theme: WorldTheme): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 280;
  canvas.height = 120;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const puffs: [number, number, number][] = [
    [64, 78, 32],
    [104, 58, 40],
    [150, 52, 44],
    [196, 66, 36],
    [230, 82, 26],
    [130, 86, 34],
  ];
  const body = new Path2D();
  for (const [x, y, r] of puffs) {
    body.moveTo(x + r, y);
    body.arc(x, y, r, 0, Math.PI * 2);
  }
  // 외곽선 먼저 굵게 → 몸을 위에 칠해 안쪽 선은 덮인다(바깥 윤곽만 남는다)
  ctx.strokeStyle = "rgba(40, 50, 90, 0.25)";
  ctx.lineWidth = 4;
  ctx.stroke(body);
  // 툰 구름 — 그늘 색 한 덩어리 위에 왼쪽 위로 비켜 놓은 같은 실루엣을 밝은 색으로(평평한 두 단 명암), 맨 위에 작은 빛
  ctx.fillStyle = theme.cloud.shade;
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = theme.cloud.mid;
  ctx.beginPath();
  for (const [x, y, r] of puffs) {
    ctx.moveTo(x - r * 0.12 + r * 0.92, y - r * 0.2);
    ctx.arc(x - r * 0.12, y - r * 0.2, r * 0.92, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = theme.cloud.lit;
  ctx.beginPath();
  for (const [x, y, r] of puffs) {
    ctx.moveTo(x - r * 0.25 + r * 0.7, y - r * 0.38);
    ctx.arc(x - r * 0.25, y - r * 0.38, r * 0.7, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
  return canvas;
}

type Baked = { ranges: HTMLCanvasElement[]; cloud: HTMLCanvasElement };
const bakedByTheme = new Map<WorldTheme, Baked>();
function baked(theme: WorldTheme): Baked | null {
  if (typeof document === "undefined") return null;
  let b = bakedByTheme.get(theme);
  if (!b) {
    b = { ranges: theme.ranges.map(bakeRange), cloud: bakeCloud(theme) };
    bakedByTheme.set(theme, b);
  }
  return b;
}

/**
 * 하늘(그라데이션·해 빛무리·빛줄기·해)은 화면 크기·테마마다 한 번 구워 두고 매 프레임 복사만 한다
 * (화면 전체 덧셈 합성을 프레임마다 하면 소프트웨어 래스터·저사양에서 프레임 시간이 크게 는다 — 실측 1280 70ms → 이 캐시)
 * 해는 아주 멀리 있어 카메라를 따라 움직이지 않는다. 빛줄기는 고정(구울 때 한 번)
 */
const skyCache = new WeakMap<CanvasRenderingContext2D, { w: number; h: number; theme: WorldTheme; high: boolean; canvas: HTMLCanvasElement }>();
function skyLayer(ctx: CanvasRenderingContext2D, width: number, height: number, theme: WorldTheme, high: boolean): HTMLCanvasElement | null {
  const hit = skyCache.get(ctx);
  if (hit && hit.w === width && hit.h === height && hit.theme === theme && hit.high === high) return hit.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const c = canvas.getContext("2d");
  if (!c) return null;
  const g = c.createLinearGradient(0, 0, 0, height);
  for (const [k, col] of theme.sky) g.addColorStop(k, col);
  c.fillStyle = g;
  c.fillRect(0, 0, width, height);
  const sunX = width * theme.sun.x;
  const sunY = height * theme.sun.y;
  c.globalCompositeOperation = "lighter";
  const glow = c.createRadialGradient(sunX, sunY, 8, sunX, sunY, Math.max(width, height) * 0.6);
  glow.addColorStop(0, `rgba(${theme.sun.glow}, 0.6)`);
  glow.addColorStop(0.22, `rgba(${theme.sun.glow}, 0.16)`);
  glow.addColorStop(1, `rgba(${theme.sun.glow}, 0)`);
  c.fillStyle = glow;
  c.fillRect(0, 0, width, height);
  if (high) {
    c.translate(sunX, sunY);
    for (let i = 0; i < 10; i++) {
      c.rotate((Math.PI * 2) / 10 + 0.05);
      const len = Math.max(width, height) * (0.7 + hash01(i + 40) * 0.5);
      const rg = c.createLinearGradient(0, 0, len, 0);
      rg.addColorStop(0, `rgba(${theme.sun.glow}, ${theme.sun.rays})`);
      rg.addColorStop(1, `rgba(${theme.sun.glow}, 0)`);
      c.fillStyle = rg;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(len, -len * 0.045);
      c.lineTo(len, len * 0.045);
      c.closePath();
      c.fill();
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  c.globalCompositeOperation = "source-over";
  c.fillStyle = theme.sun.core;
  c.beginPath();
  c.arc(sunX, sunY, 22, 0, Math.PI * 2);
  c.fill();
  skyCache.set(ctx, { w: width, h: height, theme, high, canvas });
  return canvas;
}

export function drawWorldBackdrop(ctx: CanvasRenderingContext2D, view: ViewSize, camera: Camera, opt: BackdropOptions, theme: WorldTheme): void {
  const { width, height } = view;
  const high = opt.quality === "high";
  const sky = typeof document === "undefined" ? null : skyLayer(ctx, width, height, theme, high);
  if (sky) ctx.drawImage(sky, 0, 0, width, height);

  const B = baked(theme);
  if (B) {
    drawRange(ctx, B.ranges[0], view, camera, theme.ranges[0]);
    drawClouds(ctx, B.cloud, view, camera, opt, theme);
    drawRange(ctx, B.ranges[1], view, camera, theme.ranges[1]);
    if (high) drawRange(ctx, B.ranges[2], view, camera, theme.ranges[2]);
  }
  if (!opt.reducedMotion && high) drawMotes(ctx, view, opt, theme);
  if (!opt.reducedMotion) drawStreaks(ctx, view, opt);
}

function drawRange(ctx: CanvasRenderingContext2D, tile: HTMLCanvasElement, view: ViewSize, camera: Camera, r: Range): void {
  const scale = 0.45 + camera.zoom * 0.6;
  const w = tile.width * scale;
  const h = tile.height * scale;
  const y = view.height / 2 + (r.worldY - camera.cy) * camera.zoom * (1 - r.parallax * 0.4) - h;
  let x = -((camera.cx * camera.zoom * r.parallax) % w);
  if (x > 0) x -= w;
  for (; x < view.width; x += w) ctx.drawImage(tile, x, y, w, h);
  // 아래 채움 — 타일 맨 아래와 같은 색(안개가 진한 원경은 안개 색, 가까운 층은 몸 색)
  ctx.fillStyle = r.fog >= 0.99 ? r.haze : r.bottom;
  ctx.fillRect(0, y + h - 1, view.width, view.height - (y + h) + 2);
}

function drawClouds(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement, view: ViewSize, camera: Camera, opt: BackdropOptions, theme: WorldTheme): void {
  const span = view.width + 320;
  const speed = opt.reducedMotion ? 0 : opt.wind === 0 ? 4 : opt.wind * 9;
  for (let i = 0; i < (opt.quality === "high" ? 6 : 3); i++) {
    const depth = 0.45 + hash01(i + 400) * 0.6;
    const base = hash01(i + 500) * span - camera.cx * camera.zoom * 0.22 * depth + (opt.time / 1000) * speed * depth;
    const x = (((base % span) + span) % span) - 280;
    const y = view.height * (0.08 + hash01(i + 600) * 0.24) - (camera.cy - 400) * camera.zoom * 0.1;
    const s = 0.5 + depth * 0.55;
    // 구름은 불투명한 한 덩어리(뒤가 비치면 비눗방울처럼 보인다)
    ctx.globalAlpha = theme.cloud.alpha;
    ctx.drawImage(sprite, x, y, sprite.width * s, sprite.height * s);
  }
  ctx.globalAlpha = 1;
}

function drawMotes(ctx: CanvasRenderingContext2D, view: ViewSize, opt: BackdropOptions, theme: WorldTheme): void {
  const drift = (opt.time / 1000) * (8 + opt.wind * 10);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 22; i++) {
    const x = (((hash01(i + 1100) * view.width + drift * (0.5 + hash01(i + 1200))) % view.width) + view.width) % view.width;
    const y = view.height * (0.2 + hash01(i + 1300) * 0.6) + Math.sin(opt.time / 1400 + i) * 10;
    ctx.fillStyle = `rgba(${theme.motes}, ${0.2 + 0.2 * Math.sin(opt.time / 600 + i * 2.1)})`;
    ctx.beginPath();
    ctx.arc(x, y, 1 + hash01(i + 1400) * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawStreaks(ctx: CanvasRenderingContext2D, view: ViewSize, opt: BackdropOptions): void {
  const strength = Math.abs(opt.wind);
  if (strength === 0) return;
  const dir = opt.wind > 0 ? 1 : -1;
  const count = Math.round((opt.quality === "high" ? 6 : 3) + strength * (opt.quality === "high" ? 2 : 1));
  const len = 30 + strength * 8;
  const speed = 160 + strength * 60;
  const span = view.width + len * 2;
  ctx.lineCap = "round";
  ctx.lineWidth = 1.8;
  for (let i = 0; i < count; i++) {
    const travel = ((opt.time / 1000) * speed * (0.7 + hash01(i + 800) * 0.6) + hash01(i + 700) * span) % span;
    const x = dir > 0 ? travel - len : view.width + len - travel;
    const y = view.height * (0.1 + hash01(i + 900) * 0.6) + Math.sin(opt.time / 600 + i) * 5;
    const g = ctx.createLinearGradient(x, y, x + dir * len, y);
    g.addColorStop(0, "rgba(255, 255, 255, 0)");
    g.addColorStop(1, `rgba(255, 255, 255, ${0.16 + (strength / WIND_MAX) * 0.28})`);
    ctx.strokeStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dir * len, y);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

/** 비네트·색보정 — 화면 크기·테마마다 한 장으로 구워 매 프레임 한 번 겹친다 */
let gradeCache: { w: number; h: number; theme: WorldTheme; canvas: HTMLCanvasElement } | null = null;
export function drawWorldGrade(ctx: CanvasRenderingContext2D, view: ViewSize, theme: WorldTheme): void {
  if (typeof document === "undefined") return;
  if (!gradeCache || gradeCache.w !== view.width || gradeCache.h !== view.height || gradeCache.theme !== theme) {
    const canvas = document.createElement("canvas");
    // 부드러운 그라데이션이라 반 해상도로 구워도 티가 나지 않는다
    canvas.width = Math.max(1, Math.round(view.width / 2));
    canvas.height = Math.max(1, Math.round(view.height / 2));
    const c = canvas.getContext("2d");
    if (!c) return;
    const w = canvas.width;
    const h = canvas.height;
    const r = Math.hypot(w, h) / 2;
    const g = c.createRadialGradient(w / 2, h * 0.45, r * 0.5, w / 2, h * 0.45, r * 1.05);
    g.addColorStop(0, "rgba(0, 0, 0, 0)");
    g.addColorStop(1, theme.grade.vignette);
    c.fillStyle = theme.grade.tint;
    c.fillRect(0, 0, w, h);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    gradeCache = { w: view.width, h: view.height, theme, canvas };
  }
  ctx.drawImage(gradeCache.canvas, 0, 0, view.width, view.height);
}

// ===== 지형 =====

/** 지층 타일 — 물결치는 띠(가장자리 부드럽게) + 매끈한 자갈(빛은 왼쪽 위). 가로로 이어 붙는다 */
export function bakeGroundTile(ctx: CanvasRenderingContext2D, theme: WorldTheme): CanvasPattern | string {
  const tile = document.createElement("canvas");
  tile.width = 256;
  tile.height = 192;
  const t = tile.getContext("2d");
  if (!t) return theme.ground.bands[0];
  const bands = theme.ground.bands;
  const bandH = 24;
  t.fillStyle = bands[0];
  t.fillRect(0, 0, 256, 192);
  for (let b = -1; b < 192 / bandH + 1; b++) {
    const color = bands[((b % bands.length) + bands.length) % bands.length];
    const path = new Path2D();
    const edge = (x: number, k: number) => b * bandH + k + Math.sin((x / 256) * Math.PI * 2 * 2 + b) * 4 + Math.sin((x / 256) * Math.PI * 2 * 5 + b * 1.7) * 1.6;
    path.moveTo(0, edge(0, 0));
    for (let x = 0; x <= 256; x += 4) path.lineTo(x, edge(x, 0));
    for (let x = 256; x >= 0; x -= 4) path.lineTo(x, edge(x, bandH));
    path.closePath();
    t.fillStyle = color;
    t.fill(path);
    // 띠 윗선 — 살짝 밝게(빛 받은 층)
    t.strokeStyle = "rgba(255, 240, 210, 0.12)";
    t.lineWidth = 1.5;
    t.beginPath();
    t.moveTo(0, edge(0, 0) + 1);
    for (let x = 4; x <= 256; x += 4) t.lineTo(x, edge(x, 0) + 1);
    t.stroke();
  }
  // 자갈 — 그늘(오른쪽 아래) → 몸 → 빛(왼쪽 위)
  for (let i = 0; i < 26; i++) {
    const x = hash01(i) * 256;
    const y = hash01(i + 1) * 192;
    const r = 1.2 + hash01(i + 2) * 2.6;
    t.fillStyle = "rgba(20, 10, 6, 0.35)";
    t.beginPath();
    t.ellipse(x + r * 0.3, y + r * 0.35, r, r * 0.75, 0, 0, Math.PI * 2);
    t.fill();
    t.fillStyle = theme.ground.pebble;
    t.globalAlpha = 0.75;
    t.beginPath();
    t.ellipse(x, y, r, r * 0.75, 0, 0, Math.PI * 2);
    t.fill();
    t.globalAlpha = 1;
    t.fillStyle = "rgba(255, 255, 255, 0.3)";
    t.beginPath();
    t.ellipse(x - r * 0.3, y - r * 0.3, r * 0.4, r * 0.25, 0, 0, Math.PI * 2);
    t.fill();
  }
  // 붓 점묘 — 밝고 어두운 작은 점
  for (let i = 0; i < 260; i++) {
    t.fillStyle = hash01(i + 9) > 0.5 ? "rgba(255, 230, 190, 0.12)" : "rgba(20, 8, 4, 0.14)";
    t.beginPath();
    t.arc(hash01(i + 11) * 256, hash01(i + 13) * 192, 0.8 + hash01(i + 15) * 1.4, 0, Math.PI * 2);
    t.fill();
  }
  return ctx.createPattern(tile, "repeat") ?? bands[0];
}

export type WorldPaint = { theme: WorldTheme; ground: CanvasPattern | string; deep: CanvasGradient; origTop: Int16Array | null };

/**
 * 한 열 칠하기 — 흙 + 깊이 그늘, 윗면은 원래 지표면이면 외곽선·풀(초원)·모래(협곡) 띠, 폭발로 파인 면이면 그을린 흙
 * 벽(옆 열보다 낮아진 곳)은 외곽선을 세로로 — 구덩이 가장자리도 윤곽이 보인다
 */
/**
 * 벽 외곽선 범위 — 옆 열(side)의 첫 흙 구간이 이 열의 윗면(top) 위 빈 칸과 겹치는 [시작, 끝), 2px 이하면 없음
 * 옆 열이 없으면(맵 끝) 없음
 */
export function sideWall(side: readonly number[] | undefined, top: number): [number, number] | null {
  if (!side || side.length < 2) return null;
  const from = side[0];
  const to = Math.min(top, side[1]);
  return to - from > 2 ? [from, to] : null;
}

export function paintColumnWorld(ctx: CanvasRenderingContext2D, paint: WorldPaint, x: number, spans: readonly number[], prevSpans: readonly number[] | undefined, nextSpans: readonly number[] | undefined, worldHeight: number): void {
  const g = paint.theme.ground;
  for (let i = 0; i < spans.length; i += 2) {
    const top = spans[i];
    const bottom = spans[i + 1];
    const h = bottom - top;
    ctx.fillStyle = paint.ground;
    ctx.fillRect(x, top, 1, h);
    ctx.fillStyle = paint.deep;
    ctx.fillRect(x, top, 1, h);
    const first = i === 0;
    const exposed = first && paint.origTop !== null && top > paint.origTop[x] + 3;
    if (first) {
      // 벽 외곽선 — 이 열은 비었는데 옆 열은 흙인 높이에만 세로로(구덩이 벽·절벽)
      // 옆 열의 윗면부터가 아니라 옆 열 첫 구간이 끝나는 데까지 — 구덩이 가장자리의 얇은 지표(밑이 빈 열) 아래 허공에 선이 남지 않게
      ctx.fillStyle = g.ink;
      for (const side of [prevSpans, nextSpans]) {
        const wall = sideWall(side, top);
        if (wall) ctx.fillRect(x, wall[0], 1, wall[1] - wall[0]);
      }
    }
    if (exposed || !first) {
      // 파인 면·동굴 바닥 — 그을린 흙 + 얇은 외곽선
      ctx.fillStyle = g.exposed;
      ctx.fillRect(x, top, 1, Math.min(7, h));
      ctx.fillStyle = g.ink;
      ctx.fillRect(x, top, 1, Math.min(1.5, h));
    } else {
      // 원래 지표면 — 외곽선 → 밝은 띠 → 풀·모래 → 그늘 띠
      ctx.fillStyle = g.capDark;
      ctx.fillRect(x, top, 1, Math.min(13, h));
      ctx.fillStyle = g.cap;
      ctx.fillRect(x, top, 1, Math.min(9, h));
      ctx.fillStyle = g.capLight;
      ctx.fillRect(x, top + 2, 1, Math.min(2.5, h));
      ctx.fillStyle = g.ink;
      ctx.fillRect(x, top, 1, Math.min(2, h));
      // 풀잎(초원) · 마른 덤불 점(협곡) — 고정 식으로 고른 열만 위로
      const r = hash01(x * 3.1);
      if (g.grass && r > 0.45 && h > 6) {
        const blade = 2 + Math.floor(hash01(x * 7.7) * 6);
        ctx.fillStyle = r > 0.82 ? g.capLight : g.tuft;
        ctx.fillRect(x, top - blade, 1, blade);
      } else if (!g.grass && r > 0.93 && h > 6) {
        ctx.fillStyle = g.tuft;
        ctx.fillRect(x, top - 3, 1, 3);
      }
    }
    // 동굴 천장·돌출부 밑면 — 외곽선
    if (bottom < worldHeight && h > 3) {
      ctx.fillStyle = g.ink;
      ctx.fillRect(x, bottom - 2, 1, 2);
    }
  }
}

/**
 * 화면 속 바람(D-025 보충 6) — 전경을 지나가는 나뭇잎(초원)·모래 먼지(협곡). 개수·속도는 바람 세기, 방향은 바람 방향
 * 바람 0이면 거의 제자리에서 살랑. 품질 low면 절반, 움직임 줄이기면 그리지 않는다(위쪽 바람 게이지가 같은 정보를 준다)
 */
export function drawWindLeaves(ctx: CanvasRenderingContext2D, view: ViewSize, wind: number, time: number, mapId: MapId | undefined, quality: "high" | "low", reducedMotion: boolean): void {
  if (reducedMotion) return;
  const strength = Math.abs(wind);
  const dir = wind === 0 ? 1 : Math.sign(wind);
  const count = Math.round((4 + strength * 1.6) * (quality === "low" ? 0.5 : 1));
  const canyon = mapId === "canyon";
  const speed = 18 + strength * 34; // px/초
  ctx.save();
  ctx.lineJoin = "round";
  for (let i = 0; i < count; i++) {
    const seed = hash01(i * 7.3 + 41);
    const lane = view.height * (0.32 + hash01(i * 3.1 + 9) * 0.5);
    const travel = (time / 1000) * speed * (0.7 + seed * 0.6);
    const span = view.width + 60;
    const x0 = hash01(i * 5.7 + 3) * span;
    const x = (((x0 + dir * travel) % span) + span) % span - 30;
    const y = lane + Math.sin(time / (500 + seed * 400) + i) * (8 + strength);
    const rot = time / (300 + seed * 300) + i;
    if (canyon) {
      // 모래 먼지 — 알갱이 둘이 바람 쪽으로 늘어진다(밝은 노을 하늘에서도 보이게 갈색 테)
      ctx.beginPath();
      ctx.ellipse(x, y, 3 + strength * 0.5, 2, 0, 0, Math.PI * 2);
      ctx.moveTo(x - dir * (6 + strength) + 2, y + 1);
      ctx.ellipse(x - dir * (6 + strength), y + 1, 2, 1.4, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 226, 180, ${0.8 + seed * 0.2})`;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(110, 50, 30, 0.7)";
      ctx.stroke();
    } else {
      // 나뭇잎 — 잉크 외곽선 툰 잎이 돌며 흐른다
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(rot * 1.7)));
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.quadraticCurveTo(0, -4, 5, 0);
      ctx.quadraticCurveTo(0, 4, -5, 0);
      ctx.fillStyle = seed > 0.5 ? "#7fd04f" : "#b8ec74";
      ctx.fill();
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = "#1a2412";
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}
