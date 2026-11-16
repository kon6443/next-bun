/** 탱크 그림 조각 — 스킨 무늬·레벨 장식(줄무늬·별·깃발)·포구 섬광·잔해, 그리고 작은 그리기 도구. drawTankArt(renderer/tankArt)가 쓴다 */

import type { TankSkin } from "../lib/tankSkins";
import { hash01 } from "./noise";
import { INK, rgbaOf } from "./color";
import type { Shades } from "./tankArt";


export function goldGrad(ctx: CanvasRenderingContext2D, y0: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, "#fff3b0");
  g.addColorStop(0.5, "#f6c453");
  g.addColorStop(1, "#a8661a");
  return g;
}

export function easeOut(k: number): number {
  return 1 - (1 - k) * (1 - k);
}

export function glow(ctx: CanvasRenderingContext2D, color: string, blur: number): void {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

export function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 스킨 무늬 — 클립된 영역(차체·포탑) 안에 칠한다. seed로 차체·포탑 무늬가 다르다. 작은 화면에서도 갈리게 대비·크기를 크게 */
export function paintSkin(ctx: CanvasRenderingContext2D, skin: TankSkin, color: string, x: number, y: number, w: number, h: number, px: number, seed: number): void {
  if (skin.id === "desert") {
    // 사막 위장 — 몸통 색을 모래빛으로 덮고, 큰 황토·짙은 갈색 얼룩을 짙게
    ctx.fillStyle = "rgba(226, 192, 130, 0.55)";
    ctx.fillRect(x, y, w, h);
    const blots = ["rgba(160, 104, 52, 0.9)", "rgba(92, 60, 32, 0.85)", "rgba(196, 150, 90, 0.8)"];
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = blots[i % 3];
      ctx.beginPath();
      const cx = x + hash01(seed + i) * w;
      const cy = y + hash01(seed + i + 40) * h;
      ctx.ellipse(cx, cy, w * (0.13 + hash01(seed + i + 80) * 0.12), h * (0.35 + hash01(seed + i + 90) * 0.25), hash01(seed + i + 3) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (skin.id === "arctic") {
    // 눈보라 — 몸통을 서리빛으로, 흰 얼룩, 두꺼운 눈 덮임(아래로 고드름), 서리 점
    ctx.fillStyle = "rgba(226, 240, 252, 0.45)";
    ctx.fillRect(x, y, w, h);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? "rgba(255, 255, 255, 0.85)" : "rgba(160, 196, 230, 0.7)";
      ctx.beginPath();
      ctx.ellipse(x + hash01(seed + i) * w, y + h * (0.4 + hash01(seed + i + 40) * 0.6), w * (0.1 + hash01(seed + i + 80) * 0.1), h * (0.25 + hash01(seed + i + 90) * 0.2), hash01(seed + i + 3) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255, 255, 255, 0.97)";
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k <= 12; k++) {
      const u = (w * k) / 12;
      const drip = k % 3 === 1 ? h * 0.2 : 0;
      ctx.lineTo(x + u, y + h * (0.3 + 0.08 * Math.sin(k * 1.9 + seed)) + drip);
    }
    ctx.lineTo(x + w, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    for (let i = 0; i < 12; i++) ctx.fillRect(x + hash01(seed + i + 200) * w, y + h * (0.35 + hash01(seed + i + 300) * 0.6), Math.max(px * 1.2, 1), Math.max(px * 1.2, 1));
  } else if (skin.id === "neon") {
    // 네온 — 빛나는 회로 선
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = rgbaOf(color, 0.9);
    ctx.lineWidth = Math.max(px * 1.2, 1);
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const yy = y + h * (0.3 + i * 0.22);
      ctx.moveTo(x + w * 0.08, yy);
      ctx.lineTo(x + w * (0.35 + hash01(seed + i) * 0.2), yy);
      ctx.lineTo(x + w * (0.45 + hash01(seed + i) * 0.2), yy - h * 0.12);
      ctx.lineTo(x + w * 0.92, yy - h * 0.12);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/** Lv4 — 차체 옆 굵은 셰브런 두 줄(외곽선 + 밝은 색 — 작은 화면에서도 보이게) */
export function drawStripes(ctx: CanvasRenderingContext2D, hullW: number, hullH: number, hullY: number, facing: number, skinId: string, color: string, px: number): void {
  const fill = skinId === "neon" ? color : skinId === "arctic" ? "#2f6db3" : "#ffe58a";
  for (let i = 0; i < 2; i++) {
    const cx = facing * (hullW * 0.02 + i * hullW * 0.15);
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(cx - facing * hullH * 0.38, hullY - hullH * 0.92);
      ctx.lineTo(cx, hullY - hullH * 0.56);
      ctx.lineTo(cx - facing * hullH * 0.38, hullY - hullH * 0.2);
    };
    path();
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(px * 2.6, hullH * 0.3);
    ctx.stroke();
    path();
    ctx.strokeStyle = fill;
    ctx.lineWidth = Math.max(px * 1.4, hullH * 0.18);
    ctx.stroke();
  }
}

/** Lv5 금별 — 외곽선 + 빛 반사 */
export function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, px: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, "#fff3b0");
  g.addColorStop(0.5, "#f6c453");
  g.addColorStop(1, "#b9771f");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(px, r * 0.12);
  ctx.strokeStyle = INK;
  ctx.stroke();
}

/** Lv3 깃발 — 안테나 위쪽에서 바람에 펄럭인다 */
export function drawFlag(ctx: CanvasRenderingContext2D, ax: number, ay: number, topX: number, topY: number, facing: number, R: number, color: string, t: number, px: number, still: boolean): void {
  const fx = ax + (topX - ax) * 0.62;
  const fy = ay + (topY - ay) * 0.62;
  const w = R * 0.95;
  const h = R * 0.5;
  const dir = -facing;
  ctx.beginPath();
  ctx.moveTo(topX, topY + R * 0.05);
  for (let k = 0; k <= 6; k++) {
    const u = k / 6;
    const wave = still ? 0 : Math.sin(t / 140 - u * 5) * h * 0.18 * u;
    ctx.lineTo(topX + dir * w * u, topY + R * 0.05 + wave + h * 0.1 * u);
  }
  for (let k = 6; k >= 0; k--) {
    const u = k / 6;
    const wave = still ? 0 : Math.sin(t / 140 - u * 5) * h * 0.18 * u;
    ctx.lineTo(topX + dir * w * u, topY + R * 0.05 + h + wave - h * 0.2 * u);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = Math.max(px, R * 0.05);
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.fillRect(topX + (dir < 0 ? -w * 0.5 : 0), topY + R * 0.12, w * 0.5, h * 0.18);
  void fx;
  void fy;
}

/** 포구 화염 — 앞으로 길게 뻗는 불꽃 + 옆으로 갈라지는 갈래(머즐 브레이크) + 흰 섬광. k: 1(막 쏨) → 0 */
export function drawMuzzleFlash(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, R: number, k: number, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.globalCompositeOperation = "lighter";
  const len = R * (2.2 + 2.4 * k);
  const flicker = 0.85 + 0.15 * Math.sin(t / 23);
  // 주 불꽃
  const g = ctx.createLinearGradient(0, 0, len, 0);
  g.addColorStop(0, `rgba(255, 255, 235, ${k})`);
  g.addColorStop(0.35, `rgba(255, 200, 90, ${0.9 * k})`);
  g.addColorStop(1, "rgba(255, 80, 20, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -R * 0.42);
  ctx.quadraticCurveTo(len * 0.5, -R * 0.55 * flicker, len, 0);
  ctx.quadraticCurveTo(len * 0.5, R * 0.55 * flicker, 0, R * 0.42);
  ctx.closePath();
  ctx.fill();
  // 옆 갈래 둘(머즐 브레이크로 새는 불)
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-R * 0.1, side * R * 0.2);
    ctx.quadraticCurveTo(R * 0.2, side * R * 1.0 * k, R * 0.9 * k, side * R * (1.1 + 0.4 * k));
    ctx.quadraticCurveTo(R * 0.3, side * R * 0.5, R * 0.3, side * R * 0.1);
    ctx.closePath();
    ctx.fillStyle = `rgba(255, 170, 70, ${0.75 * k})`;
    ctx.fill();
  }
  // 흰 섬광
  const f = ctx.createRadialGradient(R * 0.2, 0, 0, R * 0.2, 0, R * (1.4 + k));
  f.addColorStop(0, `rgba(255, 255, 255, ${0.95 * k})`);
  f.addColorStop(0.5, `rgba(255, 230, 160, ${0.45 * k})`);
  f.addColorStop(1, "rgba(255, 200, 120, 0)");
  ctx.fillStyle = f;
  ctx.beginPath();
  ctx.arc(R * 0.2, 0, R * (1.4 + k), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 잔해 — 기울어진 검게 탄 차체, 포탑은 떨어져 옆에, 불씨 */
export function drawWreck(ctx: CanvasRenderingContext2D, R: number, sh: Shades, ink: number, k: number, facing: number): void {
  const tilt = 0.18 * facing * Math.min(1, k * 2);
  ctx.save();
  ctx.rotate(tilt);
  const w = R * 2.7;
  const h = R * 0.9;
  roundedRect(ctx, -w / 2, -h, w, h, R * 0.25);
  const g = ctx.createLinearGradient(0, -h, 0, 0);
  g.addColorStop(0, mixStr(sh.deep, "#2a1e22", 0.5 * k + 0.3));
  g.addColorStop(1, "#140c10");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = ink;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 120, 40, 0.5)";
  for (let i = 0; i < 4; i++) ctx.fillRect(-w * 0.35 + i * w * 0.22, -h * 0.55, R * 0.12, R * 0.12);
  ctx.restore();
  // 떨어진 포탑
  ctx.beginPath();
  ctx.ellipse(-facing * R * 1.9, -R * 0.35, R * 0.62, R * 0.36, 0.5 * facing, 0, Math.PI * 2);
  ctx.fillStyle = "#1e1418";
  ctx.fill();
  ctx.lineWidth = ink;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function mixStr(a: string, b: string, k: number): string {
  return k > 0.5 ? b : a;
}
