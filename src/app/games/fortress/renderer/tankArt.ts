/**
 * 새 탱크 그림(D-025 B 보충 4) — 파츠를 나눠 그리는 절차적 탱크. 아트 규칙(시안 공통):
 * - 광원은 왼쪽 위 하나: 윗면·왼쪽 모서리에 하이라이트, 오른쪽 아래에 그늘
 * - 모든 파츠에 같은 규칙의 짙은 외곽선(화면 OUTLINE_PX — 배율과 무관)
 * - 몸통 색은 자리·팀 색(D-020) — 명암 4단계를 그 색에서 만든다
 * 파츠: 궤도(링크가 이동만큼 굴러감) · 바퀴(회전) · 차체(패널 선·리벳·해치·앞뒤 경사) · 포탑(돔·해치·잠망경) · 포신(머즐 브레이크, 반동)
 * 스킨: 기본(깔끔한 도장) · 모래폭풍(사막 위장 무늬) · 눈보라(눈 덮임·서리) · 네온 라인(어두운 차체 + 빛나는 선)
 * 레벨 장식: Lv2 안테나 · Lv3 깃발 · Lv4 줄무늬 · Lv5 금별·금테
 * 좌표는 월드 px(ctx에 카메라 변환이 걸린 상태), (x, y) = 궤도 바닥 가운데. 연출 전용 — 엔진과 무관
 */

import type { TankSkin } from "../lib/tankSkins";
import { hash01 } from "./noise";
import { INK, mixRgb, rgbaOf } from "./color";
import { drawFlag, drawMuzzleFlash, drawStar, drawStripes, drawWreck, easeOut, glow, goldGrad, paintSkin, roundedRect } from "./tankArtParts";

/** 외곽선 굵기(화면 px) */
const OUTLINE_PX = 1.6;

/** 애니메이션 상태 — 호출하는 쪽(useBattleView)이 탱크마다 들고 프레임마다 갱신한다 */
export type TankAnim = {
  /** 궤도 링크·바퀴 위상(월드 px 누적 이동) */
  tread: number;
  lastX: number;
  /** 발사 반동 1 → 0 */
  recoil: number;
  /** 피격 번쩍임 1 → 0 */
  flash: number;
  /** 피격 흔들림(월드 px) */
  jolt: number;
  /** 화면에 그리는 포신 각(도) — 목표로 부드럽게 다가간다 */
  barrel: number;
  /** 격파 연출 진행 0 → 1(1이면 잔해) */
  wreck: number;
};

export function createTankAnim(x: number, angle: number): TankAnim {
  return { tread: 0, lastX: x, recoil: 0, flash: 0, jolt: 0, barrel: angle, wreck: 0 };
}

/** 프레임마다 — 이동만큼 궤도를 굴리고, 반동·번쩍임을 줄이고, 포신을 목표 각으로 부드럽게(움직임 줄이기면 바로) */
export function stepTankAnim(a: TankAnim, x: number, targetAngle: number, alive: boolean, dtMs: number, reducedMotion: boolean): void {
  const dt = Math.min(dtMs, 50) / 1000;
  a.tread += x - a.lastX;
  a.lastX = x;
  a.recoil = Math.max(0, a.recoil - dt * 2.2);
  a.flash = Math.max(0, a.flash - dt * 4.5);
  a.jolt = a.jolt * Math.pow(0.002, dt);
  const diff = targetAngle - a.barrel;
  a.barrel = reducedMotion || Math.abs(diff) < 0.05 ? targetAngle : a.barrel + diff * Math.min(1, dt * 14);
  if (!alive) a.wreck = Math.min(1, a.wreck + dt * 1.6);
}

export type Shades = { base: string; light: string; lighter: string; dark: string; deep: string };

const shadeCache = new Map<string, Shades>();
function shades(hex: string): Shades {
  const hit = shadeCache.get(hex);
  if (hit) return hit;
  const s = { base: mixRgb(hex, [0, 0, 0], 0.08), light: mixRgb(hex, [255, 255, 255], 0.28), lighter: mixRgb(hex, [255, 250, 235], 0.55), dark: mixRgb(hex, [20, 10, 30], 0.38), deep: mixRgb(hex, [20, 10, 30], 0.62) };
  shadeCache.set(hex, s);
  return s;
}

export type TankDraw = {
  x: number;
  y: number;
  color: string;
  /** 포신 각(도, 0 오른쪽 · 90 위 · 180 왼쪽) — anim.barrel을 넘긴다 */
  angle: number;
  /** 그리기 배율(drawScene tankDrawScale) */
  scale: number;
  /** 카메라 배율 — 외곽선·잔선을 화면 px로 맞춘다 */
  zoom: number;
  skin: TankSkin;
  time: number;
  anim?: TankAnim;
  /** 잃은 HP 비율 0~1 — 0.45 넘으면 그을음, 0.7 넘으면 금 간 장갑 */
  damage?: number;
  alpha?: number;
  reducedMotion?: boolean;
  /** 차례 탱크 — 엔진 진동이 조금 더 크다 */
  active?: boolean;
};

/** 탱크 한 대 — 살아 있으면 전체, 격파되면 잔해 */
export function drawTankArt(ctx: CanvasRenderingContext2D, d: TankDraw): void {
  const R = 9 * d.scale;
  const px = 1 / Math.max(d.zoom, 0.3);
  const a = d.anim;
  const facing = d.angle <= 90 ? 1 : -1;
  const skin = d.skin;
  const neon = skin.id === "neon";
  const sh = neon ? { base: "#151a2e", light: "#232a46", lighter: "#39406a", dark: "#0c0f1c", deep: "#070914" } : shades(d.color);
  const t = d.reducedMotion ? 0 : d.time;
  // 대기 숨쉬기·엔진 진동, 피격 흔들림
  const idle = Math.sin(t / 420) * 0.35 + (d.active ? Math.sin(t / 37) * 0.18 : Math.sin(t / 53) * 0.08);
  const jolt = a ? a.jolt * Math.sin(t / 22) : 0;
  const moving = a ? Math.min(1, Math.abs(a.tread % 1000) > 0 ? 1 : 0) : 0;
  const bob = moving && a ? Math.sin(a.tread * 0.9) * 0.4 : 0;

  ctx.save();
  ctx.globalAlpha = d.alpha ?? 1;
  // 발사 반동 — 포신 반대쪽으로 밀렸다 돌아온다(움직임 줄이기면 없음)
  const push = a && !d.reducedMotion ? -Math.sin(Math.PI * Math.min(1, (1 - a.recoil) * 1.6)) * a.recoil * R * 0.32 * (d.angle <= 90 ? 1 : -1) : 0;
  ctx.translate(d.x + jolt + push, d.y);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const ink = OUTLINE_PX * px;

  if (a && a.wreck > 0) {
    drawWreck(ctx, R, sh, ink, a.wreck, facing);
    ctx.restore();
    return;
  }

  // ===== 궤도 =====
  const trackW = R * 2.9;
  const trackH = R * 0.72;
  const trackTop = -trackH;
  roundedRect(ctx, -trackW / 2, trackTop, trackW, trackH, trackH / 2);
  ctx.fillStyle = neon ? "#0b0d18" : "#2a2230";
  ctx.fill();
  ctx.lineWidth = ink;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // 링크 — 위아래 가장자리를 따라 이동만큼 흐른다
  const link = R * 0.32;
  const phase = a ? (((a.tread % link) + link) % link) : 0;
  ctx.save();
  roundedRect(ctx, -trackW / 2, trackTop, trackW, trackH, trackH / 2);
  ctx.clip();
  ctx.strokeStyle = neon ? rgbaOf(d.color, 0.55) : "#4a3f52";
  ctx.lineWidth = Math.max(px, R * 0.09);
  for (let lx = -trackW / 2 - link + phase; lx < trackW / 2 + link; lx += link) {
    ctx.beginPath();
    ctx.moveTo(lx, trackTop);
    ctx.lineTo(lx, trackTop + trackH * 0.18);
    ctx.moveTo(lx - phase * 2 + link * 0.5, -trackH * 0.18);
    ctx.lineTo(lx - phase * 2 + link * 0.5, 0);
    ctx.stroke();
  }
  ctx.restore();
  // 바퀴 — 회전(스포크가 돈다), 가운데 허브 빛
  const wheelR = trackH * 0.36;
  const spin = a ? a.tread / wheelR : 0;
  for (let i = -2; i <= 2; i++) {
    const wx = i * (trackW - trackH) / 4.4;
    const wy = trackTop + trackH / 2;
    const r = i === -2 || i === 2 ? wheelR * 0.85 : wheelR;
    ctx.beginPath();
    ctx.arc(wx, wy, r, 0, Math.PI * 2);
    ctx.fillStyle = neon ? "#141a2c" : "#55495c";
    ctx.fill();
    ctx.lineWidth = ink * 0.8;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.strokeStyle = neon ? rgbaOf(d.color, 0.8) : "#7d7085";
    ctx.lineWidth = Math.max(px * 0.8, r * 0.18);
    for (let k = 0; k < 3; k++) {
      const ang = spin + (k * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + Math.cos(ang) * r * 0.7, wy + Math.sin(ang) * r * 0.7);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(wx, wy, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = neon ? d.color : "#b9aec0";
    ctx.fill();
  }
  // 궤도 윗면 하이라이트(광원 왼쪽 위)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = Math.max(px, R * 0.06);
  ctx.beginPath();
  ctx.moveTo(-trackW / 2 + trackH / 2, trackTop + px * 1.2);
  ctx.lineTo(trackW / 2 - trackH / 2, trackTop + px * 1.2);
  ctx.stroke();

  // 측면 스커트 — 궤도 위쪽 절반을 덮는 판(볼트 줄), 바퀴는 아래로 보인다
  const skirtY = trackTop - R * 0.04;
  const skirtH = trackH * 0.42;
  roundedRect(ctx, -trackW * 0.49, skirtY, trackW * 0.98, skirtH, skirtH * 0.35);
  const sg = ctx.createLinearGradient(0, skirtY, 0, skirtY + skirtH);
  sg.addColorStop(0, sh.base);
  sg.addColorStop(1, sh.deep);
  ctx.fillStyle = sg;
  ctx.fill();
  ctx.lineWidth = ink;
  ctx.strokeStyle = neon ? d.color : INK;
  ctx.stroke();
  ctx.fillStyle = neon ? rgbaOf(d.color, 0.8) : "rgba(255, 245, 230, 0.45)";
  for (let k2 = 0; k2 < 7; k2++) ctx.fillRect(-trackW * 0.42 + (k2 * trackW * 0.84) / 6, skirtY + skirtH * 0.42, Math.max(px, R * 0.06), Math.max(px, R * 0.06));

  // ===== 차체 =====
  const hullY = trackTop - R * 0.02 + idle * 0.25 + bob;
  const hullH = R * 0.62;
  const hullW = R * 2.7;
  const slope = R * 0.42;
  const hull = new Path2D();
  // 앞(바라보는 쪽)이 더 경사진 차체
  const front = facing;
  hull.moveTo(-hullW / 2 + (front < 0 ? slope : slope * 0.55), hullY - hullH);
  hull.lineTo(hullW / 2 - (front > 0 ? slope : slope * 0.55), hullY - hullH);
  hull.lineTo(hullW / 2, hullY - hullH * 0.35);
  hull.lineTo(hullW / 2 - R * 0.1, hullY);
  hull.lineTo(-hullW / 2 + R * 0.1, hullY);
  hull.lineTo(-hullW / 2, hullY - hullH * 0.35);
  hull.closePath();
  const hg = ctx.createLinearGradient(-hullW / 2, hullY - hullH, hullW / 2, hullY);
  hg.addColorStop(0, sh.light);
  hg.addColorStop(0.45, sh.base);
  hg.addColorStop(1, sh.dark);
  ctx.fillStyle = hg;
  ctx.fill(hull);
  ctx.save();
  ctx.clip(hull);
  paintSkin(ctx, skin, d.color, -hullW / 2, hullY - hullH, hullW, hullH, px, 11);
  // 아래쪽 그늘 띠
  ctx.fillStyle = "rgba(10, 4, 18, 0.28)";
  ctx.fillRect(-hullW / 2, hullY - hullH * 0.32, hullW, hullH * 0.4);
  // 패널 선·리벳
  ctx.strokeStyle = neon ? rgbaOf(d.color, 0.9) : "rgba(10, 4, 18, 0.45)";
  ctx.lineWidth = Math.max(px * 0.8, R * 0.04);
  ctx.beginPath();
  ctx.moveTo(-hullW * 0.18, hullY - hullH);
  ctx.lineTo(-hullW * 0.22, hullY);
  ctx.moveTo(hullW * 0.2, hullY - hullH);
  ctx.lineTo(hullW * 0.24, hullY);
  ctx.moveTo(-hullW / 2, hullY - hullH * 0.36);
  ctx.lineTo(hullW / 2, hullY - hullH * 0.36);
  ctx.stroke();
  if (!neon) {
    ctx.fillStyle = sh.lighter;
    for (let i = 0; i < 6; i++) {
      const rx = -hullW * 0.4 + (i * hullW * 0.8) / 5;
      ctx.beginPath();
      ctx.arc(rx, hullY - hullH * 0.2, Math.max(px * 0.7, R * 0.045), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 윗면 하이라이트
  ctx.fillStyle = neon ? rgbaOf(d.color, 0.25) : "rgba(255, 252, 240, 0.32)";
  ctx.fillRect(-hullW / 2, hullY - hullH, hullW, Math.max(px, hullH * 0.14));
  if (skin.level >= 4) drawStripes(ctx, hullW, hullH, hullY, facing, skin.id, d.color, px);
  // 손상 — 그을음·금
  const dmg = d.damage ?? 0;
  if (dmg > 0.45) {
    ctx.fillStyle = `rgba(20, 12, 10, ${Math.min(0.55, (dmg - 0.45) * 1.4)})`;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(-hullW * 0.3 + i * hullW * 0.2 + hash01(i + 7) * R * 0.3, hullY - hullH * (0.3 + hash01(i) * 0.5), R * 0.32, R * 0.2, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (dmg > 0.7) {
    ctx.strokeStyle = "rgba(15, 6, 10, 0.7)";
    ctx.lineWidth = Math.max(px, R * 0.05);
    ctx.beginPath();
    ctx.moveTo(-hullW * 0.05, hullY - hullH);
    ctx.lineTo(hullW * 0.02, hullY - hullH * 0.6);
    ctx.lineTo(-hullW * 0.06, hullY - hullH * 0.35);
    ctx.lineTo(hullW * 0.04, hullY - hullH * 0.1);
    ctx.stroke();
  }
  ctx.restore();
  ctx.lineWidth = ink;
  ctx.strokeStyle = neon ? d.color : INK;
  if (neon) glow(ctx, d.color, 10);
  ctx.stroke(hull);
  ctx.shadowBlur = 0;
  if (skin.level >= 5) {
    // 금테 — 윗 모서리(굵게)
    ctx.strokeStyle = "#f6c453";
    ctx.lineWidth = Math.max(px * 2, R * 0.12);
    ctx.beginPath();
    ctx.moveTo(-hullW / 2 + slope * 0.6, hullY - hullH + px);
    ctx.lineTo(hullW / 2 - slope * 0.6, hullY - hullH + px);
    ctx.stroke();
  }

  // ===== 포탑·포신 =====
  // 포탑은 각진 사다리꼴(앞이 낮게 깎임) + 뒤쪽 짐칸, 포신은 앞 방패(맨틀릿)에서 나온다
  const turretX = -facing * R * 0.18;
  const turretY = hullY - hullH + px * 0.5;
  const tw = R * 1.62;
  const th = R * 0.66;
  const ang = (d.angle * Math.PI) / 180;
  const recoil = a ? easeOut(a.recoil) * R * 0.62 : 0;
  const bx = Math.cos(ang);
  const by = -Math.sin(ang);
  const pivotX = turretX + facing * tw * 0.32;
  const pivotY = turretY - th * 0.5;
  const len = R * 1.75 - recoil;
  const tipX = pivotX + bx * len;
  const tipY = pivotY + by * len;
  const bw = R * 0.2;
  // 포신 — 포탑보다 먼저(포탑 뒤로 들어간다)
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(Math.atan2(by, bx));
  roundedRect(ctx, 0, -bw / 2, len, bw, bw * 0.35);
  const bg = ctx.createLinearGradient(0, -bw / 2, 0, bw / 2);
  bg.addColorStop(0, neon ? "#39406a" : "#e6e0ea");
  bg.addColorStop(0.45, neon ? "#1a2038" : "#9a90a3");
  bg.addColorStop(1, neon ? "#0d1120" : "#4a4152");
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = ink;
  ctx.strokeStyle = neon ? d.color : INK;
  if (neon) glow(ctx, d.color, 9);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // 배연기(포신 가운데 굵은 마디) · 머즐 브레이크(구멍 둘)
  roundedRect(ctx, len * 0.48, -bw * 0.68, bw * 1.5, bw * 1.36, bw * 0.4);
  ctx.fillStyle = skin.level >= 5 ? goldGrad(ctx, -bw, bw) : neon ? "#232a46" : "#7a7083";
  ctx.fill();
  ctx.lineWidth = ink * 0.85;
  ctx.stroke();
  roundedRect(ctx, len - bw * 1.25, -bw * 0.78, bw * 1.25, bw * 1.56, bw * 0.3);
  ctx.fillStyle = skin.level >= 5 ? goldGrad(ctx, -bw, bw) : neon ? "#2b3352" : "#6b6173";
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = neon ? d.color : INK;
  ctx.fillRect(len - bw * 0.95, -bw * 0.78, Math.max(px, bw * 0.22), bw * 0.45);
  ctx.fillRect(len - bw * 0.95, bw * 0.33, Math.max(px, bw * 0.22), bw * 0.45);
  ctx.restore();
  if (a && a.recoil > 0.4) drawMuzzleFlash(ctx, tipX, tipY, Math.atan2(by, bx), R, (a.recoil - 0.4) / 0.6, t);

  const tur = new Path2D();
  const back = -facing;
  tur.moveTo(turretX + back * tw * 0.56, turretY);
  tur.lineTo(turretX + back * tw * 0.6, turretY - th * 0.55);
  tur.quadraticCurveTo(turretX + back * tw * 0.55, turretY - th, turretX + back * tw * 0.3, turretY - th);
  tur.lineTo(turretX + facing * tw * 0.2, turretY - th);
  tur.lineTo(turretX + facing * tw * 0.5, turretY - th * 0.45);
  tur.lineTo(turretX + facing * tw * 0.48, turretY);
  tur.closePath();
  const tg = ctx.createLinearGradient(turretX - tw * 0.5, turretY - th, turretX + tw * 0.4, turretY);
  tg.addColorStop(0, sh.lighter);
  tg.addColorStop(0.4, sh.base);
  tg.addColorStop(1, sh.dark);
  ctx.fillStyle = tg;
  ctx.fill(tur);
  ctx.save();
  ctx.clip(tur);
  paintSkin(ctx, skin, d.color, turretX - tw * 0.6, turretY - th, tw * 1.2, th, px, 23);
  // 아래 그늘·윗면 하이라이트·짐칸 선
  ctx.fillStyle = "rgba(10, 4, 18, 0.25)";
  ctx.fillRect(turretX - tw, turretY - th * 0.32, tw * 2, th * 0.32);
  ctx.fillStyle = neon ? rgbaOf(d.color, 0.22) : "rgba(255, 252, 240, 0.38)";
  ctx.fillRect(turretX - tw, turretY - th, tw * 2, Math.max(px, th * 0.13));
  ctx.strokeStyle = neon ? rgbaOf(d.color, 0.8) : "rgba(10, 4, 18, 0.4)";
  ctx.lineWidth = Math.max(px * 0.8, R * 0.04);
  ctx.beginPath();
  ctx.moveTo(turretX + back * tw * 0.28, turretY - th);
  ctx.lineTo(turretX + back * tw * 0.3, turretY);
  ctx.stroke();
  ctx.restore();
  ctx.lineWidth = ink;
  ctx.strokeStyle = neon ? d.color : INK;
  if (neon) glow(ctx, d.color, 10);
  ctx.stroke(tur);
  ctx.shadowBlur = 0;
  // 맨틀릿(포신 방패) — 포신이 나오는 앞쪽 둥근 블록
  roundedRect(ctx, pivotX - R * 0.17, pivotY - R * 0.2, R * 0.34, R * 0.4, R * 0.12);
  const mg = ctx.createLinearGradient(pivotX, pivotY - R * 0.2, pivotX, pivotY + R * 0.2);
  mg.addColorStop(0, neon ? "#2b3352" : sh.light);
  mg.addColorStop(1, neon ? "#0d1120" : sh.dark);
  ctx.fillStyle = mg;
  ctx.fill();
  ctx.lineWidth = ink * 0.85;
  ctx.strokeStyle = neon ? d.color : INK;
  ctx.stroke();
  // 전차장 해치(큐폴라) — 포탑 위 뒤쪽
  const cupX = turretX + back * tw * 0.12;
  const cupY = turretY - th;
  roundedRect(ctx, cupX - R * 0.26, cupY - R * 0.2, R * 0.52, R * 0.22, R * 0.08);
  ctx.fillStyle = neon ? "#232a46" : sh.base;
  ctx.fill();
  ctx.lineWidth = ink * 0.85;
  ctx.strokeStyle = neon ? rgbaOf(d.color, 0.9) : INK;
  ctx.stroke();
  ctx.fillStyle = neon ? d.color : "rgba(140, 220, 255, 0.85)";
  ctx.fillRect(cupX - R * 0.16 + (facing > 0 ? R * 0.08 : 0), cupY - R * 0.15, R * 0.12, R * 0.06);
  // 연막탄 통(포탑 옆 작은 원 셋)
  if (!neon) {
    ctx.fillStyle = sh.dark;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(turretX + back * tw * 0.42, turretY - th * (0.25 + k * 0.17), Math.max(px * 0.8, R * 0.06), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (skin.level >= 5) {
    // 최고 레벨 — 포탑 윗선 금테, 큰 금별, 지나가는 반짝임(움직임 줄이기면 정지)
    ctx.strokeStyle = "#f6c453";
    ctx.lineWidth = Math.max(px * 2, R * 0.11);
    ctx.beginPath();
    ctx.moveTo(turretX + back * tw * 0.3, turretY - th + px);
    ctx.lineTo(turretX + facing * tw * 0.2, turretY - th + px);
    ctx.stroke();
    drawStar(ctx, turretX - facing * tw * 0.04, turretY - th * 0.5, R * 0.34, px);
    if (!d.reducedMotion) {
      const sweep = ((t / 2400) % 1) * 1.6 - 0.3;
      ctx.save();
      ctx.clip(tur);
      const sx = turretX - tw * 0.6 + sweep * tw * 1.2;
      const sg2 = ctx.createLinearGradient(sx - R * 0.4, 0, sx + R * 0.4, 0);
      sg2.addColorStop(0, "rgba(255, 245, 200, 0)");
      sg2.addColorStop(0.5, "rgba(255, 245, 200, 0.55)");
      sg2.addColorStop(1, "rgba(255, 245, 200, 0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = sg2;
      ctx.fillRect(turretX - tw, turretY - th, tw * 2, th);
      ctx.restore();
    }
  }
  const turretR = th;

  // ===== 레벨 장식: 안테나·깃발 =====
  if (skin.level >= 2) {
    const ax = turretX - facing * turretR * 0.75;
    const ay = turretY - turretR * 0.55;
    const sway = (d.reducedMotion ? 0 : Math.sin(t / 380) * 0.08) + (a ? -Math.sign(a.tread) * 0 : 0);
    const topX = ax - facing * R * 0.25 + Math.sin(sway) * R * 1.4;
    const topY = ay - R * 1.55;
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(px * 1.2, R * 0.07);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(ax - facing * R * 0.1, ay - R * 0.8, topX, topY);
    ctx.stroke();
    ctx.strokeStyle = neon ? d.color : "#9a90a3";
    ctx.lineWidth = Math.max(px * 0.6, R * 0.035);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(topX, topY, Math.max(px * 1.4, R * 0.1), 0, Math.PI * 2);
    ctx.fillStyle = skin.level >= 5 ? "#f6c453" : neon ? d.color : "#ff6b6b";
    ctx.fill();
    if (skin.level >= 3) drawFlag(ctx, ax, ay, topX, topY, facing, R, neon ? d.color : skin.level >= 5 ? "#f6c453" : d.color, t, px, d.reducedMotion ?? false);
  }

  // 피격 번쩍임 — 하얗게 덮는다
  if (a && a.flash > 0) {
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(255, 240, 220, ${0.6 * a.flash})`;
    ctx.fill(hull);
    ctx.fill(tur);
  }
  ctx.restore();
}
