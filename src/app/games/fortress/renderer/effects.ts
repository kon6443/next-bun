/**
 * 연출 전용 입자·화면 흔들림 — 폭발 파편·불꽃·연기, 포탄 연기 꼬리. 엔진·리플레이와 무관(결과에 영향 없음)
 * 시간은 실제 경과(ms)로 진행한다. 개수는 품질·움직임 줄이기에 맞춰 줄인다
 */

import type { Quality } from "./backdrop";
import type { WeaponFx } from "./vivid";

/**
 * 시안 전용 종류 — chunk 외곽선 있는 흙·돌 조각(땅에 닿으면 한 번 튀고 멈춘다) · puff 툰 연기(짙은→옅은 회색, 바람에 흐른다)
 * dust 바닥을 따라 옆으로 퍼지는 흙먼지 · pop 3연발의 뒤따르는 작은 폭발 · glint 착탄 순간의 흰 섬광(빛무리 + 네 갈래 빛살)
 */
type Particle = {
  kind: "debris" | "spark" | "smoke" | "fire" | "ring" | "flash" | "chunk" | "puff" | "dust" | "pop" | "glint";
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 남은 수명 / 처음 수명(ms) */
  life: number;
  max: number;
  size: number;
  color: string;
  /** 시안 — 회전(chunk) · 시작 전 기다림(ms, 0이 되면 나타난다) · 끝 색(puff) · 모양 씨앗(chunk) · 멈춤(chunk) */
  rot?: number;
  vr?: number;
  delay?: number;
  color2?: string;
  shape?: number;
  rest?: boolean;
  bounced?: boolean;
};

export type Effects = {
  particles: Particle[];
  /** 흔들림 세기(px, 화면) — 프레임마다 줄어든다 */
  shake: number;
  /** 화면 섬광(0~1) — 큰 폭발(메가탄급)만 */
  flash: number;
  quality: Quality;
  reducedMotion: boolean;
  /** 시안 vivid·glow — 입자를 더 많이(불씨·파편 1.6배) */
  rich?: boolean;
  /** 시안 — 화면 붉은 틴트(0~1, 메가탄) */
  tint?: number;
  /** 시안 — (x, y) 아래 지면 높이(없으면 −1). chunk가 땅에 떨어진다. 없으면 바닥 없음 */
  ground?: (x: number, y: number) => number;
};

const MAX_PARTICLES = 420;
const DEBRIS_COLORS = ["#6f4c2a", "#8a6038", "#4d7c0f", "#5f4024"];

export function createEffects(): Effects {
  return { particles: [], shake: 0, flash: 0, quality: "high", reducedMotion: false };
}

let seed = 1;
/** 연출용 가벼운 난수(결정성 불필요 — 엔진 RNG와 섞지 않으려고 따로 둔다) */
function rnd(): number {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

function push(fx: Effects, p: Particle) {
  if (fx.particles.length >= MAX_PARTICLES) fx.particles.shift();
  fx.particles.push(p);
}

function scaled(fx: Effects, n: number): number {
  const k = (fx.quality === "low" ? 0.4 : 1) * (fx.reducedMotion ? 0.5 : 1) * (fx.rich ? 1.6 : 1);
  return Math.max(1, Math.round(n * k));
}

/** 이 반지름 이상이면 화면 섬광까지(메가탄 90) */
const SCREEN_FLASH_RADIUS = 80;

/** 폭발 — 섬광·충격파 2겹·불꽃·불씨·흙 파편·연기, 반지름(무기 크기)에 비례. 큰 폭발은 화면 섬광 */
export function spawnExplosion(fx: Effects, x: number, y: number, r: number): void {
  push(fx, { kind: "flash", x, y, vx: 0, vy: 0, life: 220, max: 220, size: r * 2.4, color: "#fff7d6" });
  push(fx, { kind: "ring", x, y, vx: 0, vy: 0, life: 460, max: 460, size: r * 2.6, color: "#fde68a" });
  push(fx, { kind: "ring", x, y, vx: 0, vy: 0, life: 700, max: 700, size: r * 3.6, color: "#fde68a" });
  if (r >= SCREEN_FLASH_RADIUS && !fx.reducedMotion) fx.flash = 1;
  for (let i = scaled(fx, 18 + r * 0.7); i > 0; i--) {
    const a = rnd() * Math.PI * 2;
    const v = (120 + rnd() * 260) * (0.7 + r / 90);
    push(fx, { kind: "spark", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 380 + rnd() * 300, max: 680, size: 1.5 + rnd() * 1.5, color: rnd() > 0.5 ? "#fbbf24" : "#fb923c" });
  }
  for (let i = scaled(fx, 12 + r * 0.5); i > 0; i--) {
    const a = -Math.PI * (0.1 + rnd() * 0.8);
    const v = 90 + rnd() * 230;
    push(fx, { kind: "debris", x: x + (rnd() - 0.5) * r, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 900 + rnd() * 600, max: 1500, size: 2 + rnd() * 3, color: DEBRIS_COLORS[Math.floor(rnd() * DEBRIS_COLORS.length)] });
  }
  // 불덩이 — 짧게 부풀었다 꺼지는 주황 덩어리
  for (let i = scaled(fx, 8 + r * 0.12); i > 0; i--) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * r * 0.5;
    push(fx, { kind: "fire", x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 40, life: 380 + rnd() * 260, max: 640, size: r * (0.25 + rnd() * 0.3), color: rnd() > 0.5 ? "251, 146, 60" : "250, 204, 21" });
  }
  for (let i = scaled(fx, 12 + r * 0.25); i > 0; i--) {
    push(fx, { kind: "smoke", x: x + (rnd() - 0.5) * r, y: y - rnd() * r * 0.5, vx: (rnd() - 0.5) * 30, vy: -20 - rnd() * 30, life: 1200 + rnd() * 900, max: 2100, size: r * (0.35 + rnd() * 0.4), color: "71, 85, 105" });
  }
  if (!fx.reducedMotion) fx.shake = Math.min(14, fx.shake + 3 + r * 0.18);
}

/** 시안 폭발의 지형·무기 재료 — 파편·먼지 색은 맵 지면, 불 색은 무기 */
export type BlastStyle = { kind: WeaponFx["kind"]; fire: WeaponFx["fire"]; debris: readonly string[]; dust: string };

/** 무기 위력별 화면 흔들림(px) — 메가탄 > 대형탄 > 포탄 > 분열탄 > 폭격(여러 발) > 3연발(여러 발) */
export const VIVID_SHAKE: Record<WeaponFx["kind"], number> = { mega: 16, heavy: 10, shell: 6, split: 5, strike: 4.5, triple: 3 };
const SMOKE_DARK = "#3d3440";
const SMOKE_LIGHT = "#c4b8c0";

/**
 * 폭발(시안) — 흰 섬광 · 외곽선 흙·돌 조각(포물선, 땅에 떨어짐) · 불티 줄기 · 바닥 흙먼지 링 · 위로 솟아 바람에 흐르는 툰 연기 여러 덩이 · 위력별 흔들림
 * 무기별: 메가탄 버섯구름(기둥 + 머리)·붉은 틴트 / 폭격 말려 올라가는 연기 기둥 / 3연발 뒤따르는 작은 폭발 2개
 * 개수는 품질·움직임 줄이기에 맞춰 줄고(scaled), 움직임 줄이기면 흔들림·틴트를 끈다. 불덩이·충격파 자체는 drawBlastVivid
 */
export function spawnExplosionVivid(fx: Effects, x: number, y: number, r: number, style: BlastStyle): void {
  const big = style.kind === "mega";
  const k = r / 36;
  // 흰 섬광 — 움직임 줄이기면 끈다(밝기 깜빡임)
  if (!fx.reducedMotion) push(fx, { kind: "glint", x, y, vx: 0, vy: 0, life: 120, max: 120, size: r * (big ? 2.6 : 1.8), color: "#ffffff" });
  // 흙·돌 조각 — 위쪽 원뿔로 튀어 올라 포물선
  for (let i = Math.min(scaled(fx, 6 + r * 0.12), big ? 24 : 16); i > 0; i--) {
    const a = -Math.PI * (0.15 + rnd() * 0.7);
    const v = (160 + rnd() * 240) * (0.75 + k * 0.35);
    const life = 1500 + rnd() * 700;
    push(fx, { kind: "chunk", x: x + (rnd() - 0.5) * r * 0.5, y: y - 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: (2.5 + rnd() * 3.5) * Math.min(1.8, 0.8 + k * 0.3), color: style.debris[Math.floor(rnd() * style.debris.length)], rot: rnd() * 6.28, vr: (rnd() - 0.5) * 18, shape: Math.floor(rnd() * 1000) });
  }
  // 불티 줄기
  for (let i = scaled(fx, 10 + r * 0.3); i > 0; i--) {
    const a = rnd() * Math.PI * 2;
    const v = (180 + rnd() * 320) * (0.7 + k * 0.3);
    const c = style.fire[rnd() > 0.5 ? 0 : 1];
    push(fx, { kind: "spark", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: 320 + rnd() * 320, max: 640, size: 1.6 + rnd() * 1.6, color: `rgb(${c[0]}, ${c[1]}, ${c[2]})` });
  }
  // 바닥 흙먼지 링 — 양옆으로 퍼진다
  for (let i = scaled(fx, 6 + r * 0.08); i > 0; i--) {
    const side = i % 2 ? 1 : -1;
    const v = (120 + rnd() * 160) * (0.8 + k * 0.3);
    const life = 420 + rnd() * 320;
    push(fx, { kind: "dust", x: x + side * r * 0.4, y: y + r * 0.1, vx: side * v, vy: -6 - rnd() * 12, life, max: life, size: r * (0.11 + rnd() * 0.09), color: style.dust });
  }
  // 연기 — 불덩이 뒤(조금 기다렸다가) 여러 덩이가 위로 솟는다. 메가탄은 두 번째 폭발이 늦게 피므로 더 기다린다
  for (let i = scaled(fx, 5 + r * 0.06); i > 0; i--) {
    const life = 1600 + rnd() * 900;
    push(fx, { kind: "puff", x: x + (rnd() - 0.5) * r * 0.9, y: y - rnd() * r * 0.4, vx: (rnd() - 0.5) * 30, vy: -(35 + rnd() * 45) * (0.8 + k * 0.25), life, max: life, size: r * (0.28 + rnd() * 0.16), color: SMOKE_DARK, color2: SMOKE_LIGHT, delay: (140 + rnd() * 160) * (big ? 2.4 : 1) });
  }
  if (big) {
    // 버섯구름 — 좁은 기둥이 솟고, 위에서 머리가 옆으로 퍼진다
    for (let i = 0; i < scaled(fx, 6); i++) {
      const life = 2200 + rnd() * 600;
      push(fx, { kind: "puff", x: x + (rnd() - 0.5) * r * 0.25, y: y - i * r * 0.2, vx: 0, vy: -(90 + i * 14), life, max: life, size: r * (0.24 + rnd() * 0.06), color: SMOKE_DARK, color2: SMOKE_LIGHT, delay: 260 + i * 40 });
    }
    for (let i = 0; i < scaled(fx, 9); i++) {
      const a = (i / 9) * Math.PI;
      const life = 2300 + rnd() * 600;
      push(fx, { kind: "puff", x: x + Math.cos(a) * r * 0.3, y: y - r * 1.5, vx: Math.cos(a) * (50 + rnd() * 30), vy: -60 - rnd() * 20, life, max: life, size: r * (0.3 + rnd() * 0.1), color: "#5a4a52", color2: SMOKE_LIGHT, delay: 520 + rnd() * 120 });
    }
    if (!fx.reducedMotion) fx.tint = 1;
  } else if (style.kind === "strike") {
    // 불기둥 위로 말려 올라가는 연기
    for (let i = 0; i < scaled(fx, 7); i++) {
      const life = 1300 + rnd() * 400;
      push(fx, { kind: "puff", x: x + (i % 2 ? 1 : -1) * r * 0.12, y: y - r * (0.5 + i * 0.25), vx: (i % 2 ? 1 : -1) * 12, vy: -(100 + i * 8), life, max: life, size: r * (0.42 + rnd() * 0.08), color: SMOKE_DARK, color2: SMOKE_LIGHT, delay: 90 + i * 40 });
    }
  } else if (style.kind === "triple") {
    // 뒤따라 작게 연달아 터진다
    for (let i = 0; i < 2; i++) {
      const c = style.fire[1];
      push(fx, { kind: "pop", x: x + (i ? 1 : -1) * r * (0.55 + rnd() * 0.3), y: y - r * (0.2 + rnd() * 0.4), vx: 0, vy: 0, life: 260, max: 260, size: r * 0.5, color: `rgb(${c[0]}, ${c[1]}, ${c[2]})`, delay: 90 + i * 110 });
    }
  }
  if (!fx.reducedMotion) {
    const v = VIVID_SHAKE[style.kind];
    fx.shake = Math.min(18, Math.max(fx.shake, v) + v * 0.15);
  }
}

/**
 * 발사 연기·먼지(시안) — 포구에서 앞으로 퍼지는 연기 덩이 줄 + 차체 양옆 바닥에서 튀는 흙먼지
 * (mx, my) 포구, (dx, dy) 포신 방향(단위), (gx, gy) 탱크 발밑
 */
export function spawnMuzzleBlast(fx: Effects, mx: number, my: number, dx: number, dy: number, gx: number, gy: number): void {
  for (let i = scaled(fx, 9); i > 0; i--) {
    const v = 40 + rnd() * 120;
    const spread = (rnd() - 0.5) * 0.9;
    push(fx, { kind: "smoke", x: mx, y: my, vx: (dx + spread * dy) * v, vy: (dy - spread * dx) * v - 10, life: 900 + rnd() * 700, max: 1600, size: 5 + rnd() * 7, color: "214, 206, 220" });
  }
  for (let i = scaled(fx, 10); i > 0; i--) {
    const side = rnd() > 0.5 ? 1 : -1;
    push(fx, { kind: "smoke", x: gx + side * (8 + rnd() * 16), y: gy - 2, vx: side * (40 + rnd() * 80), vy: -20 - rnd() * 40, life: 700 + rnd() * 500, max: 1200, size: 4 + rnd() * 5, color: "176, 140, 104" });
  }
  for (let i = scaled(fx, 6); i > 0; i--) {
    const side = rnd() > 0.5 ? 1 : -1;
    push(fx, { kind: "debris", x: gx + side * 10, y: gy - 2, vx: side * (60 + rnd() * 90), vy: -80 - rnd() * 90, life: 500 + rnd() * 300, max: 800, size: 1.5 + rnd() * 2, color: DEBRIS_COLORS[Math.floor(rnd() * DEBRIS_COLORS.length)] });
  }
}

/** 피격 흔들림 세기(월드 px) — 피해에 비례(10 → 약 3, 50 → 8, 상한 8) */
export function hitJolt(amount: number): number {
  return Math.min(8, 1.8 + Math.max(0, amount) * 0.125);
}

/** 격파된 잔해의 연기 한 덩이(시안) — 툰 연기가 위로 솟으며 바람에 흐른다. 움직임 줄이기면 덩이를 작게 */
export function spawnWreckSmoke(fx: Effects, x: number, y: number): void {
  const life = 2200 + rnd() * 900;
  push(fx, { kind: "puff", x: x + (rnd() - 0.5) * 12, y, vx: (rnd() - 0.5) * 8, vy: -(26 + rnd() * 18), life, max: life, size: (fx.reducedMotion ? 6 : 9) + rnd() * 5, color: "#3d3440", color2: "#b7aab3" });
}

/** 날아가는 탄 뒤 연기 한 줌 */
export function spawnTrailSmoke(fx: Effects, x: number, y: number): void {
  if (fx.quality === "low" && rnd() > 0.4) return;
  push(fx, { kind: "smoke", x: x + (rnd() - 0.5) * 3, y: y + (rnd() - 0.5) * 3, vx: (rnd() - 0.5) * 10, vy: -6 - rnd() * 8, life: 500 + rnd() * 400, max: 1300, size: 2 + rnd() * 2.5, color: "203, 213, 225" });
}

const GRAVITY_FX = 520;

/** dt(ms)만큼 진행 — 바람은 연기를 옆으로 민다 */
export function updateEffects(fx: Effects, dtMs: number, wind: number): void {
  const dt = Math.min(dtMs, 50) / 1000;
  const alive: Particle[] = [];
  for (const p of fx.particles) {
    if (p.delay !== undefined && p.delay > 0) {
      p.delay -= dtMs;
      alive.push(p);
      continue;
    }
    p.life -= dtMs;
    if (p.life <= 0) continue;
    if (p.kind === "chunk") {
      // 멈춘 조각도 다음 폭발로 발밑이 파이면 다시 떨어진다(허공에 떠 있지 않게)
      if (p.rest && fx.ground) {
        const below = fx.ground(p.x, p.y - 1);
        if (below < 0 || below > p.y + 1) {
          p.rest = false;
          p.vy = 0;
        }
      }
      if (!p.rest) {
        p.vy += GRAVITY_FX * 1.3 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot = (p.rot ?? 0) + (p.vr ?? 0) * dt;
        const floor = fx.ground && p.vy > 0 ? fx.ground(p.x, p.y - p.vy * dt - 1) : -1;
        if (floor >= 0 && p.y >= floor) {
          // 한 번 튀고(느리면 바로) 두 번째 닿으면 멈춘다
          p.y = floor;
          if (p.bounced || Math.abs(p.vy) < 90) p.rest = true;
          p.bounced = true;
          p.vy *= -0.32;
          p.vx *= 0.5;
          p.vr = (p.vr ?? 0) * 0.5;
        }
      }
      alive.push(p);
      continue;
    }
    if (p.kind === "debris" || p.kind === "spark") {
      p.vy += GRAVITY_FX * dt;
      p.vx *= 0.99;
    } else if (p.kind === "smoke") {
      p.vx += wind * 6 * dt;
      p.size += 6 * dt;
    } else if (p.kind === "fire") {
      p.size += 20 * dt;
    } else if (p.kind === "puff") {
      p.vx += wind * 10 * dt;
      p.vy *= Math.pow(0.55, dt);
      p.size += 8 * dt;
    } else if (p.kind === "dust") {
      p.vx *= Math.pow(0.06, dt);
      p.size += 10 * dt;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    alive.push(p);
  }
  fx.particles = alive;
  fx.shake = fx.shake < 0.3 ? 0 : fx.shake * Math.pow(0.0015, dt);
  fx.flash = fx.flash < 0.02 ? 0 : fx.flash * Math.pow(0.002, dt);
  if (fx.tint) fx.tint = fx.tint < 0.02 ? 0 : fx.tint * Math.pow(0.04, dt);
}

/** 화면 흔들림 오프셋(px) */
export function shakeOffset(fx: Effects, time: number): [number, number] {
  if (fx.shake === 0) return [0, 0];
  return [Math.sin(time * 0.09) * fx.shake, Math.cos(time * 0.11) * fx.shake * 0.7];
}

/**
 * 월드 좌표 변환이 걸린 ctx에 그린다 — 크기는 월드 px
 * grow(r) = 폭발 크기 보정 배율(멀리 볼 때 화면 최소 크기, drawScene의 blastDrawRadius) — 섬광·고리·불덩이에 곱한다
 */
export function drawEffects(ctx: CanvasRenderingContext2D, fx: Effects, zoom: number, grow: (r: number) => number = () => 1): void {
  drawToonPuffs(ctx, fx, zoom);
  for (const p of fx.particles) {
    if (p.delay !== undefined && p.delay > 0) continue;
    const k = p.life / p.max;
    if (p.kind === "puff" || p.kind === "dust") continue;
    if (p.kind === "chunk") {
      drawChunk(ctx, p, k, zoom);
      continue;
    }
    if (p.kind === "pop") {
      drawPop(ctx, p, k, zoom);
      continue;
    }
    if (p.kind === "glint") {
      drawGlint(ctx, p, k, grow(p.size));
      continue;
    }
    if (p.kind === "fire") {
      const size = p.size * grow(p.size);
      ctx.fillStyle = `rgba(${p.color}, ${0.6 * k})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === "smoke") {
      ctx.fillStyle = `rgba(${p.color}, ${0.28 * k})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === "debris") {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.globalAlpha = 1;
    } else if (p.kind === "spark") {
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = k;
      ctx.lineWidth = p.size / Math.max(zoom, 0.5);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (p.kind === "ring") {
      const t = 1 - k;
      ctx.strokeStyle = `rgba(253, 230, 138, ${0.7 * k})`;
      ctx.lineWidth = (3 * k + 1) / Math.max(zoom, 0.5);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * grow(p.size) * (0.3 + 0.7 * t), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(255, 247, 214, ${0.85 * k})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * grow(p.size) * (1.2 - 0.4 * k), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const INK = "#160b1c";

/** 툰 연기·먼지 — 덩이 크기(끝물에 줄어든다) */
function puffRadius(p: Particle): number {
  const k = p.life / p.max;
  const t = 1 - k;
  const grow = Math.min(1, t * 5);
  return p.size * (0.4 + 0.6 * grow) * (k < 0.3 ? k / 0.3 : 1);
}

/** 두 색 사이(#rrggbb) */
function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/**
 * 연기·먼지를 한 덩어리 실루엣으로 — 모든 덩이의 외곽선을 먼저 긋고 그 위에 채운다(겹친 안쪽 선이 보이지 않게, 구름과 같은 방식)
 * 불투명으로 그리고 끝물엔 줄어들며 사라진다(반투명은 겹친 선이 비친다)
 */
function drawToonPuffs(ctx: CanvasRenderingContext2D, fx: Effects, zoom: number): void {
  const list = fx.particles.filter((p) => (p.kind === "puff" || p.kind === "dust") && !(p.delay !== undefined && p.delay > 0));
  if (list.length === 0) return;
  ctx.save();
  ctx.lineWidth = 2.6 / Math.max(zoom, 0.5);
  ctx.strokeStyle = INK;
  ctx.beginPath();
  for (const p of list) {
    const r = puffRadius(p);
    ctx.moveTo(p.x + r, p.y);
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  }
  ctx.stroke();
  for (const p of list) {
    const r = puffRadius(p);
    const t = 1 - p.life / p.max;
    ctx.fillStyle = p.kind === "puff" && p.color2 ? mix(p.color, p.color2, Math.min(1, t * 1.4)) : p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // 윗면 빛 — 왼쪽 위로 비켜 놓은 밝은 점
  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  ctx.beginPath();
  for (const p of list) {
    const r = puffRadius(p) * 0.5;
    ctx.moveTo(p.x - r * 0.6 + r, p.y - r * 0.7);
    ctx.arc(p.x - r * 0.6, p.y - r * 0.7, r, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}

/** 흙·돌 조각 — 들쭉날쭉한 4~5각형, 잉크 외곽선 + 윗면 빛. 멈춘 뒤 끝물에 옅어진다 */
function drawChunk(ctx: CanvasRenderingContext2D, p: Particle, k: number, zoom: number): void {
  const n = 4 + ((p.shape ?? 0) % 2);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot ?? 0);
  ctx.globalAlpha = k < 0.3 ? k / 0.3 : 1;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = p.size * (0.7 + 0.5 * (((p.shape ?? 0) * (i + 3) * 37) % 100) / 100);
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = p.color;
  ctx.fill();
  ctx.lineWidth = 1.2 / Math.max(zoom, 0.5);
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
  ctx.fillRect(-p.size * 0.5, -p.size * 0.55, p.size * 0.6, p.size * 0.3);
  ctx.restore();
}

/** 뒤따르는 작은 폭발(3연발) — 툰 불꽃 한 덩이가 피었다 줄어든다 */
function drawPop(ctx: CanvasRenderingContext2D, p: Particle, k: number, zoom: number): void {
  const t = 1 - k;
  const r = p.size * (t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7 * 0.8);
  ctx.save();
  ctx.lineWidth = 1.6 / Math.max(zoom, 0.5);
  ctx.strokeStyle = INK;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.moveTo(p.x + Math.cos(a) * r * 0.5 + r * 0.55, p.y + Math.sin(a) * r * 0.5);
    ctx.arc(p.x + Math.cos(a) * r * 0.5, p.y + Math.sin(a) * r * 0.5, r * 0.55, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.fillStyle = p.color;
  ctx.fill();
  ctx.fillStyle = "#fffbe6";
  ctx.beginPath();
  ctx.arc(p.x - r * 0.15, p.y - r * 0.15, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 착탄 순간의 흰 섬광 — 덧셈 빛무리 + 네 갈래 빛살(가늘고 긴 마름모), 0.12초 */
function drawGlint(ctx: CanvasRenderingContext2D, p: Particle, k: number, grow: number): void {
  const size = p.size * grow;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
  g.addColorStop(0, `rgba(255, 255, 255, ${k})`);
  g.addColorStop(0.35, `rgba(255, 250, 230, ${0.7 * k})`);
  g.addColorStop(1, "rgba(255, 240, 200, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255, 255, 255, ${k})`;
  const long = size * 1.5;
  const thin = size * 0.09;
  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    if (i === 0) {
      ctx.moveTo(p.x - long, p.y);
      ctx.lineTo(p.x, p.y - thin);
      ctx.lineTo(p.x + long, p.y);
      ctx.lineTo(p.x, p.y + thin);
    } else {
      ctx.moveTo(p.x, p.y - long * 0.8);
      ctx.lineTo(p.x + thin, p.y);
      ctx.lineTo(p.x, p.y + long * 0.8);
      ctx.lineTo(p.x - thin, p.y);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
