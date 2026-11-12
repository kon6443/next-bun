/**
 * 시안 "vivid"(D-025 B) — 무기별 탄·폭발·데미지 숫자. 배경·지형은 renderer/vividWorld, 탱크는 renderer/tankArt
 * 기본 화면(classic)은 그대로 — look이 vivid·glow일 때만 쓴다. 연출 전용(엔진·리플레이와 무관)
 */

import type { BlastView, PopupView, ShellView } from "./playback";

// ===== 무기별 연출 =====

type Rgb = readonly [number, number, number];
const rgba = (c: Rgb, a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
const INK = "#160b1c";

/**
 * 무기별 탄·폭발 팔레트와 모양 — 엔진 WEAPONS id 순서(0 포탄 · 1 3연발 · 2 대형탄 · 3 분열탄 · 4 메가탄 · 5 폭격)
 * 모르는 id·없음은 포탄 모양. 연출 전용이라 크기·판정은 엔진의 폭발 반지름 그대로다
 */
export type WeaponFx = {
  kind: "shell" | "triple" | "heavy" | "split" | "mega" | "strike";
  /** 탄 몸통·빛머리·꼬리 */
  body: string;
  glow: Rgb;
  trail: Rgb;
  /** 탄 몸통 크기(화면 px 기준 반지름) */
  size: number;
  /** 폭발 불덩이 3색(심·가운데·테) */
  fire: readonly [Rgb, Rgb, Rgb];
  /** 퍼지는 충격파 고리 굵기(0이면 없음) */
  ring: number;
};

const FX: readonly WeaponFx[] = [
  { kind: "shell", body: "#3b3f4a", glow: [255, 214, 140], trail: [255, 150, 70], size: 3.6, fire: [[255, 250, 225], [255, 196, 90], [235, 80, 30]], ring: 0 },
  { kind: "triple", body: "#1e5a7a", glow: [140, 236, 255], trail: [80, 200, 255], size: 2.8, fire: [[240, 255, 255], [120, 225, 255], [40, 120, 230]], ring: 0 },
  { kind: "heavy", body: "#4a3424", glow: [255, 190, 110], trail: [210, 120, 60], size: 5, fire: [[255, 244, 210], [255, 160, 60], [190, 60, 20]], ring: 2.5 },
  { kind: "split", body: "#5b2a7a", glow: [240, 160, 255], trail: [210, 90, 255], size: 3.8, fire: [[255, 240, 255], [240, 130, 255], [140, 40, 200]], ring: 0 },
  { kind: "mega", body: "#7a1a1a", glow: [255, 120, 80], trail: [255, 70, 40], size: 6.5, fire: [[255, 255, 230], [255, 170, 60], [220, 30, 30]], ring: 4 },
  { kind: "strike", body: "#2f3b2a", glow: [255, 230, 120], trail: [255, 200, 80], size: 3.6, fire: [[255, 252, 220], [255, 205, 80], [230, 100, 20]], ring: 1.5 },
];

export function weaponFx(weaponId?: number): WeaponFx {
  return (weaponId !== undefined && FX[weaponId]) || FX[0];
}

/** 0~1 고정 의사난수(같은 자리는 같은 모양 — 프레임마다 흔들리지 않게) */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * 탄 — 무기 색 꼬리(넓은 잔광 + 밝은 심, 덧셈) + 빛무리 + 진행 방향으로 누운 툰 탄 몸통(잉크 외곽선·윗면 빛)
 * 메가탄은 빛무리가 맥박치고, 분열탄은 둘레에 작은 불티가 돈다, 폭격은 아래로 떨어지는 날개 달린 폭탄
 */
export function drawShellVivid(ctx: CanvasRenderingContext2D, s: ShellView, zoom: number, fx: WeaponFx = FX[0], time = 0, reducedMotion = false): void {
  const n = s.trail.length / 2;
  const px = 1 / Math.max(zoom, 0.35);
  const wide = fx.kind === "mega" ? 1.6 : fx.kind === "heavy" ? 1.3 : fx.kind === "triple" ? 0.7 : 1;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < n; i++) {
      const k = i / n;
      ctx.strokeStyle = pass === 0 ? rgba(fx.trail, 0.16 * k) : rgba([255, 244, 220], 0.6 * k);
      ctx.lineWidth = (pass === 0 ? (9 * k + 2) * wide : (2.4 * k + 0.8) * Math.min(wide, 1.2)) * px;
      ctx.beginPath();
      ctx.moveTo(s.trail[i * 2 - 2], s.trail[i * 2 - 1]);
      ctx.lineTo(s.trail[i * 2], s.trail[i * 2 + 1]);
      ctx.stroke();
    }
  }
  // 메가탄 빛무리 맥박·분열탄 불티 회전 — 움직임 줄이기면 멈춘다
  const t = reducedMotion ? 0 : time;
  const pulse = fx.kind === "mega" ? 1 + 0.18 * Math.sin(t / 70) : 1;
  const halo = fx.size * 4.2 * px * pulse;
  const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, halo);
  g.addColorStop(0, rgba([255, 255, 240], 0.95));
  g.addColorStop(0.3, rgba(fx.glow, 0.75));
  g.addColorStop(1, rgba(fx.glow, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(s.x, s.y, halo, 0, Math.PI * 2);
  ctx.fill();
  if (fx.kind === "split") {
    // 분열 직전처럼 둘레에 도는 불티 3개
    for (let i = 0; i < 3; i++) {
      const a = t / 120 + (i * Math.PI * 2) / 3;
      ctx.fillStyle = rgba(fx.glow, 0.9);
      ctx.beginPath();
      ctx.arc(s.x + Math.cos(a) * fx.size * 2.6 * px, s.y + Math.sin(a) * fx.size * 2.6 * px, 1.6 * px, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // 몸통 — 마지막 두 표본으로 방향
  const dx = n >= 2 ? s.x - s.trail[(n - 2) * 2] : 1;
  const dy = n >= 2 ? s.y - s.trail[(n - 2) * 2 + 1] : 0;
  const ang = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
  const r = fx.size * px;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(ang);
  ctx.lineJoin = "round";
  ctx.lineWidth = 1.4 * px;
  ctx.strokeStyle = INK;
  if (fx.kind === "strike") {
    // 꼬리 날개
    ctx.fillStyle = fx.body;
    ctx.beginPath();
    ctx.moveTo(-r * 1.2, 0);
    ctx.lineTo(-r * 2.3, -r * 1.1);
    ctx.lineTo(-r * 2.3, r * 1.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(r * 1.7, 0);
  ctx.quadraticCurveTo(r * 1.2, -r, 0, -r);
  ctx.lineTo(-r * 1.3, -r);
  ctx.lineTo(-r * 1.3, r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(r * 1.2, r, r * 1.7, 0);
  ctx.closePath();
  ctx.fillStyle = fx.body;
  ctx.fill();
  ctx.stroke();
  // 윗면 빛 띠 + 탄두 무기 색
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.fillRect(-r * 1.1, -r * 0.7, r * 1.6, r * 0.35);
  ctx.fillStyle = rgba(fx.glow, 1);
  ctx.beginPath();
  ctx.moveTo(r * 1.7, 0);
  ctx.quadraticCurveTo(r * 1.35, -r * 0.62, r * 0.75, -r * 0.8);
  ctx.lineTo(r * 0.75, r * 0.8);
  ctx.quadraticCurveTo(r * 1.35, r * 0.62, r * 1.7, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * 포구 앞 탄 미리보기(D-025 보충 6) — 조준 중 고른 무기의 탄을 포신 방향으로 띄운다(빛무리 + 툰 몸통). 3연발은 셋, 폭격은 날개
 * angleDeg는 엔진 각도(0 오른쪽 · 90 위 · 180 왼쪽). 움직임 줄이기면 숨쉬기 없이 고정
 */
export function drawMuzzleShell(ctx: CanvasRenderingContext2D, x: number, y: number, angleDeg: number, zoom: number, fx: WeaponFx, time: number, reducedMotion = false): void {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = -Math.sin(a);
  const breathe = reducedMotion ? 0 : Math.sin(time / 260) * 0.12;
  const count = fx.kind === "triple" ? 3 : 1;
  for (let i = 0; i < count; i++) {
    const spread = (i - (count - 1) / 2) * 0.32;
    const ca = Math.cos(spread);
    const sa = Math.sin(spread);
    const ux = dx * ca - dy * sa;
    const uy = dx * sa + dy * ca;
    const trail = [x - ux * 6, y - uy * 6, x, y];
    drawShellVivid(ctx, { id: -1, x: x + ux * (4 + breathe * 6) + (count > 1 ? -ux * 2 : 0), y: y + uy * (4 + breathe * 6), trail }, zoom * (count > 1 ? 1.25 : 0.95), fx, time, reducedMotion);
  }
}

/**
 * 폭발 — 무기 색 불덩이(덧셈) + 툰 불꽃 꽃잎(평면 2색·잉크 외곽선, 초반) + 충격파 고리 + 끝물 연기 뭉치(툰 실루엣)
 * 분열탄은 별빛 갈래, 메가탄은 두 겹 고리와 위로 솟는 버섯 머리, 폭격은 위로 솟는 불기둥
 * reducedMotion이면 고리·갈래를 생략한다(밝기 깜빡임을 줄이려고 불덩이도 덜 밝게)
 */
export function drawBlastVivid(ctx: CanvasRenderingContext2D, blast: BlastView, radius: number, fx: WeaponFx = FX[0], reducedMotion = false): void {
  let b = blast;
  let r = radius;
  if (fx.kind === "mega") {
    // 두 단계 — 처음 22%는 작은 폭발(포탄 모양), 그 뒤 더 크게 한 번 더
    const STAGE = 0.22;
    if (b.progress < STAGE) {
      drawBlastVivid(ctx, { ...b, progress: (b.progress / STAGE) * 0.5 }, r * 0.45, FX[0], reducedMotion);
      return;
    }
    b = { ...b, progress: (b.progress - STAGE) / (1 - STAGE) };
    r *= 1.2;
  }
  const fade = 1 - b.progress;
  const [c0, c1, c2] = fx.fire;
  const seed = Math.round(b.x * 7 + b.y * 13);
  const bright = reducedMotion ? 0.7 : 1;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r * 1.45);
  g.addColorStop(0, rgba(c0, 0.95 * fade * bright));
  g.addColorStop(0.25, rgba(c1, 0.9 * fade * bright));
  g.addColorStop(0.6, rgba(c2, 0.6 * fade * bright));
  g.addColorStop(1, rgba(c2, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(b.x, b.y, r * 1.45, 0, Math.PI * 2);
  ctx.fill();
  if (!reducedMotion && fx.kind === "split" && b.progress < 0.7) {
    // 별빛 갈래 — 6방향
    ctx.strokeStyle = rgba(c1, 0.8 * (1 - b.progress / 0.7));
    ctx.lineWidth = r * 0.12;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + hash(seed) * 0.5;
      ctx.moveTo(b.x + Math.cos(a) * r * 0.4, b.y + Math.sin(a) * r * 0.4);
      ctx.lineTo(b.x + Math.cos(a) * r * (0.9 + b.progress * 1.2), b.y + Math.sin(a) * r * (0.9 + b.progress * 1.2));
    }
    ctx.stroke();
  }
  ctx.restore();

  // 툰 불꽃 꽃잎 — 초반에만, 바깥 잉크 외곽선 하나로 이어진 실루엣(구름과 같은 방식: 외곽선 먼저, 채움 나중)
  if (b.progress < 0.62) {
    const k = b.progress / 0.62;
    const petals = fx.kind === "mega" ? 9 : fx.kind === "triple" ? 5 : 7;
    // 반투명으로 흐리면 안쪽 원 외곽선이 비친다 — 불투명 그대로 두고 끝물에 줄어들며 사라진다
    const pr = r * (0.55 + 0.35 * Math.min(1, k * 1.6)) * (k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1);
    const blob = new Path2D();
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2 + hash(seed + i) * 0.4;
      const d = pr * (0.55 + 0.25 * hash(seed + i * 3));
      const rr = pr * (0.42 + 0.2 * hash(seed + i * 5));
      const x = b.x + Math.cos(a) * d;
      const y = b.y + Math.sin(a) * d - pr * 0.1;
      blob.moveTo(x + rr, y);
      blob.arc(x, y, rr, 0, Math.PI * 2);
    }
    blob.moveTo(b.x + pr * 0.7, b.y);
    blob.arc(b.x, b.y, pr * 0.7, 0, Math.PI * 2);
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1.5, r * 0.09);
    ctx.strokeStyle = INK;
    ctx.stroke(blob);
    ctx.fillStyle = rgba(c2, 1);
    ctx.fill(blob);
    ctx.clip(blob);
    ctx.fillStyle = rgba(c1, 1);
    ctx.beginPath();
    ctx.arc(b.x - pr * 0.15, b.y - pr * 0.2, pr * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(c0, 1);
    ctx.beginPath();
    ctx.arc(b.x - pr * 0.25, b.y - pr * 0.3, pr * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 폭격 — 굵은 불기둥(둥근 머리, 바깥 진한 색·안쪽 밝은 색). 불투명, 끝물에 가늘어진다. 위로 말려 올라가는 연기는 입자(effects)
  if (fx.kind === "strike" && b.progress < 0.75) {
    const k = b.progress / 0.75;
    const h = r * (1.2 + 1.6 * Math.min(1, k * 2));
    const w = r * 0.8 * (1 - k * 0.55);
    const flame = (half: number, top: number) => {
      ctx.beginPath();
      ctx.moveTo(b.x - half, b.y);
      ctx.bezierCurveTo(b.x - half * 1.25, b.y - top * 0.55, b.x - half * 0.8, b.y - top, b.x, b.y - top);
      ctx.bezierCurveTo(b.x + half * 0.8, b.y - top, b.x + half * 1.25, b.y - top * 0.55, b.x + half, b.y);
      ctx.closePath();
    };
    ctx.save();
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.6, r * 0.08);
    flame(w, h);
    ctx.fillStyle = rgba(c2, 1);
    ctx.fill();
    ctx.stroke();
    flame(w * 0.62, h * 0.78);
    ctx.fillStyle = rgba(c1, 1);
    ctx.fill();
    flame(w * 0.3, h * 0.5);
    ctx.fillStyle = rgba(c0, 1);
    ctx.fill();
    ctx.restore();
  }

  // 충격파 고리
  if (fx.ring > 0 && !reducedMotion && b.progress < 0.8) {
    const k = b.progress / 0.8;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 250, 235, ${0.7 * (1 - k)})`;
    ctx.lineWidth = fx.ring * (1 - k * 0.6) * Math.max(1, r / 40);
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, r * (0.8 + 1.4 * k), r * (0.8 + 1.4 * k) * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (fx.kind === "mega" && k > 0.15) {
      const k2 = (k - 0.15) / 0.85;
      ctx.strokeStyle = rgba(c1, 0.6 * (1 - k2));
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, r * (0.6 + 1.1 * k2), r * (0.6 + 1.1 * k2) * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 끝물 연기 — 툰 실루엣 뭉치가 떠오르며 옅어진다(메가탄은 버섯 머리처럼 높이)
  if (b.progress > 0.5 && b.progress < 1) {
    const k = (b.progress - 0.5) / 0.5;
    const rise = r * (fx.kind === "mega" ? 1.4 : 0.5) * k;
    // 꽃잎처럼 불투명 — 피어오르다 끝물에 줄어들며 사라진다
    const sr = r * (0.55 + 0.35 * k) * (k > 0.55 ? 1 - (k - 0.55) / 0.45 : 1);
    const smoke = new Path2D();
    for (let i = 0; i < 4; i++) {
      const a = Math.PI + (i / 3) * Math.PI;
      const x = b.x + Math.cos(a) * sr * 0.7;
      const y = b.y - rise + Math.sin(a) * sr * 0.35;
      const rr = sr * (0.5 + 0.2 * hash(seed + i * 7));
      smoke.moveTo(x + rr, y);
      smoke.arc(x, y, rr, 0, Math.PI * 2);
    }
    ctx.save();
    ctx.lineWidth = Math.max(1.2, r * 0.06);
    ctx.strokeStyle = INK;
    ctx.stroke(smoke);
    ctx.fillStyle = "#7d6c78";
    ctx.fill(smoke);
    ctx.clip(smoke);
    ctx.fillStyle = "#a8979f";
    ctx.beginPath();
    ctx.arc(b.x - sr * 0.3, b.y - rise - sr * 0.3, sr * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** 피해 단계 — 숫자 크기·색·문구(D-025 보충 6). 20 미만 · 20~29 · 30~44(강타) · 45 이상(치명타) */
export function popupTier(amount: number): { size: number; color: string; label: string | null; burst: boolean } {
  if (amount >= 45) return { size: 40, color: "#ff3b3b", label: "치명타!", burst: true };
  if (amount >= 30) return { size: 34, color: "#ff4d4d", label: "강타!", burst: false };
  if (amount >= 20) return { size: 28, color: "#ff9a3d", label: null, burst: false };
  return { size: 22, color: "#ffc94d", label: null, burst: false };
}

/** 숫자가 튀어 오른 배율(움직임 줄이기면 1) */
function popupScale(progress: number, reducedMotion: boolean): number {
  return reducedMotion ? 1 : progress < 0.1 ? 0.6 + (progress / 0.1) * 0.8 : 1.4 - Math.min(0.4, (progress - 0.1) * 1.4);
}

/** 숫자 기준선(혼자 떠 있을 때) — 탱크 머리 위에서 위로 떠오른다 */
export function popupNaturalY(p: PopupView, py: number, reducedMotion = false): number {
  return py - 22 - (reducedMotion ? 0 : p.progress * 40);
}

/** 숫자가 기준선 위로 차지하는 높이(쌓기용) */
export function popupHeight(p: PopupView, reducedMotion = false): number {
  return Math.round(popupTier(p.amount).size * popupScale(p.progress, reducedMotion));
}

/** 문구(강타·치명타)가 숫자 기준선 아래로 내려오는 높이 — 문구는 자기 숫자 바로 아래 부제 */
export function popupLabelBelow(p: PopupView): number {
  return popupTier(p.amount).label ? 17 : 0;
}

/**
 * 같은 탱크에 겹친 숫자의 기준선 — 새 숫자(진행이 작은 것)부터 제자리, 먼저 뜬 숫자는 바로 아래 숫자의 윗선(문구 포함)보다 6px 위
 * 반환은 입력 순서 그대로의 y
 */
export function stackPopupYs(popups: readonly PopupView[], py: number, reducedMotion = false): number[] {
  const order = popups.map((p, i) => ({ p, i })).sort((a, b) => a.p.progress - b.p.progress);
  const ys = new Array<number>(popups.length);
  let top: number | undefined;
  for (const { p, i } of order) {
    const natural = popupNaturalY(p, py, reducedMotion);
    // 위 숫자의 부제(문구)가 아래 숫자에 닿지 않게 — 부제 높이 + 간격만큼 더 올린다
    const y = top === undefined ? natural : Math.min(natural, top - 8 - popupLabelBelow(p));
    ys[i] = y;
    top = y - popupHeight(p, reducedMotion);
  }
  return ys;
}

/** 데미지 숫자 — 단계별로 크게 튀어 오르고(치명타는 뒤에 별빛), 움직임 줄이기면 튐·기울기·별빛 없이 제자리에서 옅어진다. y = 기준선(쌓기는 호출부) */
export function drawPopupVivid(ctx: CanvasRenderingContext2D, p: PopupView, px: number, y: number, reducedMotion = false): void {
  const tier = popupTier(p.amount);
  const size = Math.round(tier.size * popupScale(p.progress, reducedMotion));
  const alpha = p.progress > 0.72 ? (1 - p.progress) / 0.28 : 1;
  const tilt = reducedMotion ? 0 : (tier.label ? -0.08 : -0.04) * (1 - p.progress);
  ctx.save();
  ctx.translate(px, y);
  ctx.rotate(tilt);
  ctx.globalAlpha = alpha;
  if (tier.burst && !reducedMotion && p.progress < 0.45) {
    // 치명타 별빛 — 숫자 뒤 금빛 갈래 8개가 퍼지며 옅어진다
    const k = p.progress / 0.45;
    ctx.save();
    ctx.translate(0, -size * 0.35);
    ctx.rotate(k * 0.6);
    ctx.fillStyle = `rgba(255, 214, 90, ${0.75 * (1 - k)})`;
    const rr = size * (0.9 + 0.9 * k);
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 === 0 ? rr : rr * 0.38;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.font = `900 ${size}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  ctx.lineWidth = tier.size >= 34 ? 7 : 6;
  ctx.strokeStyle = "rgba(20, 8, 24, 0.95)";
  ctx.strokeText(`-${p.amount}`, 0, 0);
  const g = ctx.createLinearGradient(0, -size, 0, 0);
  g.addColorStop(0, "#fffbe6");
  g.addColorStop(1, tier.color);
  ctx.fillStyle = g;
  ctx.fillText(`-${p.amount}`, 0, 0);
  if (tier.label) {
    // 문구는 자기 숫자 바로 아래 부제 — 위에 두면 위에 쌓인 다른 숫자의 문구처럼 읽힌다
    ctx.font = `900 ${tier.burst ? 13 : 12}px system-ui, sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeText(tier.label, 0, 14);
    ctx.fillStyle = tier.burst ? "#ffd65a" : "#ffe08a";
    ctx.fillText(tier.label, 0, 14);
  }
  ctx.restore();
}
