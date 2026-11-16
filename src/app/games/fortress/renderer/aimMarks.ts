import { TANK_RADIUS, cosDeg, sinDeg } from "../engine";
import type { Aim } from "./drawScene";

/** 전장 위 표시(월드 좌표) — 조준 안내·예상 궤적·지난 착탄점·차례 시작 고리 */

/** 차례 시작 고리 길이(ms) */
export const TURN_RING_MS = 900;

/** 차례 시작 고리 — 탱크 둘레에서 금빛 두 겹 고리가 퍼지며 옅어진다(월드 좌표). 움직임 줄이기면 퍼지지 않는 고리가 옅어지기만 */
export function drawTurnRing(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, R: number, zoom: number, reducedMotion: boolean): void {
  const fade = 1 - k;
  ctx.save();
  ctx.lineWidth = 3 / Math.max(zoom, 0.5);
  for (let i = 0; i < 2; i++) {
    const kk = Math.max(0, k - i * 0.18);
    const r = reducedMotion ? R * 2.2 : R * (1.4 + kk * 2.6);
    ctx.strokeStyle = `rgba(255, 214, 90, ${(i === 0 ? 0.9 : 0.55) * fade})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** 조준 안내 — 포신 끝에서 점선, 파워가 클수록 길다 */
export function drawAimGuide(ctx: CanvasRenderingContext2D, aim: Aim, zoom: number, scale: number): void {
  const R = TANK_RADIUS * scale;
  const ox = aim.x + (R * 1.9 * cosDeg(aim.angle)) / 10000;
  const oy = aim.y - R * 1.15 - (R * 1.9 * sinDeg(aim.angle)) / 10000;
  const len = 26 + aim.power * 0.7;
  const ex = ox + (len * cosDeg(aim.angle)) / 10000;
  const ey = oy - (len * sinDeg(aim.angle)) / 10000;
  ctx.strokeStyle = "rgba(250, 204, 21, 0.95)";
  ctx.lineWidth = 3 / zoom;
  ctx.setLineDash([8 / zoom, 6 / zoom]);
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(250, 204, 21, 0.95)";
  ctx.beginPath();
  ctx.arc(ex, ey, 3.5 / zoom, 0, Math.PI * 2);
  ctx.fill();
}

/** 예상 궤적 — 점들이 끝으로 갈수록 흐려진다(끝 = 비행 1/3 지점, 착탄점은 보이지 않는다) */
export function drawAimPath(ctx: CanvasRenderingContext2D, path: readonly number[], zoom: number): void {
  const n = path.length / 2;
  // 화면에서 9px 간격 — 틱 샘플이 촘촘해도 점이 뭉치지 않게
  const gap = 9 / zoom;
  let lastX = path[0];
  let lastY = path[1];
  const r = Math.max(1.6, 2.6 / zoom);
  for (let i = 1; i < n; i++) {
    const x = path[i * 2];
    const y = path[i * 2 + 1];
    if (Math.hypot(x - lastX, y - lastY) < gap && i < n - 1) continue;
    lastX = x;
    lastY = y;
    ctx.fillStyle = `rgba(250, 204, 21, ${0.95 - 0.7 * (i / n)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 지난 발 착탄점 — 탱크 색 X와 "지난 발" */
export function drawLastImpact(ctx: CanvasRenderingContext2D, p: { x: number; y: number }, color: string, zoom: number): void {
  const k = 7 / zoom;
  ctx.strokeStyle = "rgba(2, 6, 23, 0.85)";
  ctx.lineWidth = 5 / zoom;
  ctx.beginPath();
  ctx.moveTo(p.x - k, p.y - k);
  ctx.lineTo(p.x + k, p.y + k);
  ctx.moveTo(p.x + k, p.y - k);
  ctx.lineTo(p.x - k, p.y + k);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5 / zoom;
  ctx.stroke();
  ctx.font = `600 ${11 / zoom}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.lineWidth = 3 / zoom;
  ctx.strokeStyle = "rgba(2, 6, 23, 0.85)";
  ctx.strokeText("지난 발", p.x, p.y - k - 4 / zoom);
  ctx.fillStyle = "#fde68a";
  ctx.fillText("지난 발", p.x, p.y - k - 4 / zoom);
}
