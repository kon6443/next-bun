/**
 * 입체 블록 스프라이트 — 베벨(밝은 위·왼쪽, 어두운 아래·오른쪽)·세로 그라데이션·광택·네온 테두리를 칸 크기별로 한 번만 그려 둔다
 * 매 프레임 칸마다 그라데이션을 만들지 않고 drawImage로 복사한다 (판 200칸 + 미리보기)
 * 발광(글로우)도 같은 방식 — shadowBlur는 스프라이트를 만들 때 한 번만 쓰고, 매 프레임은 복사만 한다(모바일 fps)
 */

import { GARBAGE_CELL } from './boardRules';
import { BLOCK_SKIN_COUNT, DEFAULT_SKIN_ID, MAX_SKIN_LEVEL, blockSkin, blockSkinIndex } from './skins';

/** 칸 값(0 빈칸 · 1~7 블록 종류 + 1 · 8 가비지) → 기본 블록 스킨 색. 블록 색은 가이드라인 순서 I J L O S T Z — 스킨별 색은 skins.ts */
export const CELL_COLORS: readonly string[] = blockSkin(DEFAULT_SKIN_ID).cells;

/** 대전 가비지 칸 값 — 블록 값 1~7과 구분 (대전 래퍼 값을 그대로 쓴다 — 두 곳에 따로 적어 어긋나지 않게) */
export const GARBAGE_CELL_VALUE = GARBAGE_CELL;

/**
 * 크기가 바뀔 때마다 새로 만들므로 상한을 두고 넘으면 비운다 — 블록·발광은 따로 세어 서로 밀어내지 않게
 * 대전은 판마다 주인 스킨·레벨이 섞이고(내 판·상대 판 × 칸 9종 × 미리보기 크기) 한 화면에 100가지를 넘을 수 있어 넉넉히
 */
const CACHE_LIMIT = 192;
/**
 * 키는 숫자(((픽셀 크기 × 칸 종류 수 + 칸 값) × 블록 스킨 수 + 블록 스킨 번호) × 레벨 수 + 레벨 − 1) — drawBlock은 프레임마다 수백 번 불려 문자열 키를 만들면 GC가 늘어난다 (games-polish FE-22)
 * 칸 값은 CELL_COLORS 범위(0~8), 스킨 번호는 블록 스킨 수 범위, 레벨은 1~5라 겹치지 않는다 — 블록 스킨·레벨이 다르면 다른 캔버스(판마다 주인 스킨이 섞여 그려진다)
 * 모르는 블록 id는 default와 같은 그림이라 같은 번호(blockSkinIndex)
 */
const KEY_STRIDE = CELL_COLORS.length;
const spriteKey = (px: number, cell: number, skin: string, level = 1) =>
  ((px * KEY_STRIDE + cell) * BLOCK_SKIN_COUNT + blockSkinIndex(skin)) * MAX_SKIN_LEVEL + (spriteLevel(level) - 1);

/** 스프라이트에 굽는 레벨 — 범위 밖은 1(Lv1 = 레벨 도입 전 그림) */
const spriteLevel = (level: number) => (Number.isInteger(level) && level >= 1 && level <= MAX_SKIN_LEVEL ? level : 1);
const blockCache = new Map<number, HTMLCanvasElement>();
const glowCache = new Map<number, HTMLCanvasElement>();

type Rgb = [number, number, number];

const WHITE = '#ffffff';

function parseHex(hex: string): Rgb {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** t > 0이면 흰색 쪽으로, t < 0이면 검은색 쪽으로 섞는다 */
function shade([r, g, b]: Rgb, t: number): string {
  const target = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  const mix = (c: number) => Math.round(c + (target - c) * k);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function rgba([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 색상환에서 degrees만큼 돌린 색 — Lv4 두 톤 그라데이션의 둘째 색 */
export function hueShift([r, g, b]: Rgb, degrees: number): Rgb {
  // RGB 색상 회전 행렬(밝기 보존 근사)
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const m = [
    0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.14, 0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072,
  ];
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return [clamp(m[0] * r + m[1] * g + m[2] * b), clamp(m[3] * r + m[4] * g + m[5] * b), clamp(m[6] * r + m[7] * g + m[8] * b)];
}

/**
 * 블록 무늬(고대비·게임보이) — 블록마다 다른 모양을 몸통 가운데에. 밝은 색 위엔 검정, 어두운 색 위엔 흰색
 * I 가로줄 · J 점 · L 빈 네모 · O 꽉 찬 네모 · S 빗금(/) · T 세모 · Z 빗금(\)
 */
function drawPattern(ctx: CanvasRenderingContext2D, [r, g, b]: Rgb, cell: number, x0: number, size: number, inkColor?: string): void {
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  const ink = inkColor ?? (luminance > 140 ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.75)');
  const c = x0 + size / 2;
  const half = size * 0.22;
  const line = Math.max(1, Math.round(size * 0.1));
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineWidth = line;
  ctx.beginPath();
  switch (cell) {
    case 1:
      ctx.fillRect(c - half, c - line / 2, half * 2, line);
      return;
    case 2:
      ctx.arc(c, c, half * 0.6, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 3:
      ctx.strokeRect(c - half, c - half, half * 2, half * 2);
      return;
    case 4:
      ctx.fillRect(c - half * 0.8, c - half * 0.8, half * 1.6, half * 1.6);
      return;
    case 5:
      ctx.moveTo(c - half, c + half);
      ctx.lineTo(c + half, c - half);
      ctx.stroke();
      return;
    case 6:
      ctx.moveTo(c, c - half);
      ctx.lineTo(c + half, c + half);
      ctx.lineTo(c - half, c + half);
      ctx.closePath();
      ctx.fill();
      return;
    case 7:
      ctx.moveTo(c - half, c - half);
      ctx.lineTo(c + half, c + half);
      ctx.stroke();
      return;
  }
}

/**
 * 유리 블록(투명, D-003) — 거의 무색으로 비치는 몸통 + 밝은 외곽선. 블록 7종은 외곽선 밝기 단계·무늬로 가른다
 * 몸통이 비어 보여도 외곽선이 칸 경계를 지켜 쌓인 모양이 읽힌다(판 가독성)
 */
function drawGlassBody(ctx: CanvasRenderingContext2D, rgb: Rgb, garbage: boolean, x0: number, size: number): void {
  const x1 = x0 + size;
  const body = ctx.createLinearGradient(0, x0, 0, x1);
  body.addColorStop(0, `rgba(255, 255, 255, ${garbage ? 0.14 : 0.08})`);
  body.addColorStop(1, `rgba(255, 255, 255, ${garbage ? 0.08 : 0.02})`);
  ctx.fillStyle = body;
  ctx.fillRect(x0, x0, size, size);
  const line = Math.max(1, Math.round(size * 0.1));
  ctx.strokeStyle = garbage ? shade(rgb, 0) : rgba(rgb, 0.95);
  ctx.lineWidth = line;
  ctx.strokeRect(x0 + line / 2, x0 + line / 2, size - line, size - line);
  if (garbage) return;
  // 유리 반사 — 왼쪽 위 사선
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  ctx.moveTo(x0 + line, x0 + line);
  ctx.lineTo(x0 + size * 0.5, x0 + line);
  ctx.lineTo(x0 + line, x0 + size * 0.5);
  ctx.closePath();
  ctx.fill();
}

/** 판 초콜릿 몰드 — 베벨 안쪽을 한 번 더 두르는 오목한 테두리(어두운 선 + 안쪽 밝은 선). 가운데는 블록 무늬 자리라 비워 둔다 */
function drawChocolateMold(ctx: CanvasRenderingContext2D, rgb: Rgb, x0: number, size: number, bevel: number): void {
  const line = Math.max(1, Math.round(size * 0.05));
  const inset = x0 + bevel + line;
  const inner = size - (bevel + line) * 2;
  if (inner <= line * 4) return;
  ctx.lineWidth = line;
  ctx.strokeStyle = shade(rgb, -0.35);
  ctx.strokeRect(inset + line / 2, inset + line / 2, inner - line, inner - line);
  ctx.strokeStyle = shade(rgb, 0.28);
  ctx.strokeRect(inset + line * 1.5, inset + line * 1.5, inner - line * 3, inner - line * 3);
}

/** 네 갈래 반짝임 별 */
function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx, cy, cx + r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + r);
  ctx.quadraticCurveTo(cx, cy, cx - r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - r);
  ctx.fill();
}

/**
 * 레벨 강화 레이어(블록) — 모든 테마에 같은 레이어. Lv1은 그리지 않는다(레벨 도입 전 그림)
 * 원칙(D-003): 레벨은 블록 색을 밝히지 않고 효과를 더한다 — 기본 색·명도 단계는 모든 레벨에서 그대로 보이게
 *   Lv2 광택(위쪽 가장자리 하이라이트 + 사선 띠) · Lv3 림라이트(안쪽 테두리 — 발광도 진해진다) · Lv4 옅은 두 톤(여러 색 테마만)·사선 반사 · Lv5 반짝임 별 둘
 * 유리(투명)는 몸통을 채우지 않고 선으로만(반사선·외곽선 안쪽 빛) — 몸통이 계속 비치게. Lv5 별은 작은 점이라 예외로 채운다
 * 하이라이트 색은 테마가 정한다(초콜릿은 캐러멜·골드, 그 밖은 흰색)
 * 움직이는 강화(Lv4 샤인·Lv5 반짝임)는 renderer가 매 프레임 따로 그린다(levelLayers)
 */
function drawLevelLayers(
  ctx: CanvasRenderingContext2D,
  rgb: Rgb,
  level: number,
  x0: number,
  size: number,
  bevel: number,
  style: { mono: boolean; glass: boolean; highlight: Rgb },
): void {
  const x1 = x0 + size;
  const inner = size - bevel * 2;
  const hl = style.highlight;
  if (level >= 4 && !style.mono && !style.glass) {
    // 옅은 두 톤 — 오른쪽 아래 구석에만 색상을 돌린 색이 비친다(기본 색이 그대로 읽히게)
    const tone = ctx.createLinearGradient(x0, x0, x1, x1);
    tone.addColorStop(0.5, rgba(rgb, 0));
    tone.addColorStop(1, rgba(hueShift(rgb, 60), 0.45));
    ctx.fillStyle = tone;
    ctx.fillRect(x0 + bevel, x0 + bevel, inner, inner);
  }
  if (level >= 2) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, x0, size, size);
    ctx.clip();
    if (style.glass) {
      // 유리 반사선 — 몸통은 비운 채 가는 사선 하나(Lv4부터 둘)
      ctx.strokeStyle = rgba(hl, level >= 3 ? 0.85 : 0.7);
      ctx.lineWidth = Math.max(1, size * 0.07);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0 + size * 0.22, x0 + size * 0.5);
      ctx.lineTo(x0 + size * 0.5, x0 + size * 0.22);
      if (level >= 4) {
        ctx.moveTo(x0 + size * 0.35, x0 + size * 0.72);
        ctx.lineTo(x0 + size * 0.72, x0 + size * 0.35);
      }
      ctx.stroke();
    } else {
      // 위쪽 가장자리 하이라이트 — 위 35%만, 아래로 사라진다(몸통 색은 그대로). 아래 사선 띠는 왼쪽 위 모서리의 가는 빛줄로 따로
      const gloss = ctx.createLinearGradient(0, x0, 0, x0 + size * 0.35);
      gloss.addColorStop(0, rgba(hl, level >= 3 ? 0.5 : 0.42));
      gloss.addColorStop(1, rgba(hl, 0));
      ctx.fillStyle = gloss;
      ctx.fillRect(x0 + bevel * 0.5, x0 + bevel * 0.5, size - bevel, size * 0.35);
      // 사선 띠 — 가늘게
      ctx.fillStyle = rgba(hl, 0.28);
      ctx.beginPath();
      ctx.moveTo(x0 + size * 0.3, x0);
      ctx.lineTo(x0 + size * 0.46, x0);
      ctx.lineTo(x0, x0 + size * 0.46);
      ctx.lineTo(x0, x0 + size * 0.3);
      ctx.closePath();
      ctx.fill();
      if (level >= 4) {
        // 사선 반사 — 오른쪽 아래에 짧은 빛줄
        ctx.strokeStyle = rgba(hl, 0.45);
        ctx.lineWidth = Math.max(1, size * 0.05);
        ctx.beginPath();
        ctx.moveTo(x1 - bevel - size * 0.32, x1 - bevel);
        ctx.lineTo(x1 - bevel, x1 - bevel - size * 0.32);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  if (level >= 3) {
    // 림라이트 — 안쪽을 도는 하이라이트 선(유리는 외곽선 바로 안쪽)
    const line = Math.max(1, Math.round(size * (style.glass ? 0.05 : 0.07)));
    const inset = style.glass ? Math.max(1, Math.round(size * 0.1)) : bevel;
    ctx.strokeStyle = rgba(hl, style.glass ? 0.6 : 0.75);
    ctx.lineWidth = line;
    ctx.strokeRect(x0 + inset + line / 2, x0 + inset + line / 2, size - inset * 2 - line, size - inset * 2 - line);
  }
  if (level >= 5) {
    // 반짝임 별 — 오른쪽 위 큰 별 + 왼쪽 아래 작은 별
    const r = Math.max(2, size * 0.22);
    ctx.fillStyle = rgba(hl, 0.95);
    drawStar(ctx, x1 - bevel - r * 0.8, x0 + bevel + r * 0.8, r);
    drawStar(ctx, x0 + bevel + r * 0.6, x1 - bevel - r * 0.6, r * 0.5);
  }
}

function drawSprite(ctx: CanvasRenderingContext2D, px: number, cell: number, skin: string, level: number): void {
  const palette = blockSkin(skin);
  const rgb = parseHex(palette.cells[cell]);
  const garbage = cell === GARBAGE_CELL_VALUE;
  const gap = Math.max(1, Math.round(px * 0.04));
  const x0 = gap;
  const x1 = px - gap;
  const size = x1 - x0;
  const bevel = Math.max(1, Math.round(size * 0.14));

  if (palette.finish === 'glass') {
    drawGlassBody(ctx, rgb, garbage, x0, size);
    if (garbage) return;
    // 무늬 — 몸통이 비치니 외곽선과 같은 밝은 잉크로
    if (palette.patterns) drawPattern(ctx, rgb, cell, x0, size, rgba(rgb, 0.85));
    drawLevelLayers(ctx, rgb, level, x0, size, Math.max(1, Math.round(size * 0.1)), { mono: true, glass: true, highlight: parseHex(palette.highlight ?? WHITE) });
    return;
  }

  // 몸통 — 위는 밝게, 아래는 어둡게
  const body = ctx.createLinearGradient(0, x0, 0, x1);
  body.addColorStop(0, shade(rgb, garbage ? 0.08 : 0.2));
  body.addColorStop(0.55, shade(rgb, 0));
  body.addColorStop(1, shade(rgb, garbage ? -0.15 : -0.22));
  ctx.fillStyle = body;
  ctx.fillRect(x0, x0, size, size);

  // 베벨 — 네 변을 사다리꼴로
  const edge = (color: string, points: number[]) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.closePath();
    ctx.fill();
  };
  edge(shade(rgb, garbage ? 0.2 : 0.45), [x0, x0, x1, x0, x1 - bevel, x0 + bevel, x0 + bevel, x0 + bevel]);
  edge(shade(rgb, garbage ? 0.1 : 0.25), [x0, x0, x0 + bevel, x0 + bevel, x0 + bevel, x1 - bevel, x0, x1]);
  edge(shade(rgb, garbage ? -0.3 : -0.4), [x0, x1, x0 + bevel, x1 - bevel, x1 - bevel, x1 - bevel, x1, x1]);
  edge(shade(rgb, garbage ? -0.2 : -0.28), [x1, x0, x1, x1, x1 - bevel, x1 - bevel, x1 - bevel, x0 + bevel]);

  if (garbage) return;
  if (palette.finish === 'chocolate') drawChocolateMold(ctx, rgb, x0, size, bevel);
  // 네온 테두리 — 밝은 같은 색 선이 블록 둘레를 감싼다
  ctx.strokeStyle = shade(rgb, 0.55);
  ctx.lineWidth = Math.max(1, Math.round(size * 0.06));
  const inset = ctx.lineWidth / 2;
  ctx.strokeRect(x0 + inset, x0 + inset, size - ctx.lineWidth, size - ctx.lineWidth);
  // 광택 — 왼쪽 위 안쪽에 짧은 하이라이트
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.fillRect(x0 + bevel, x0 + bevel, Math.max(1, Math.round(size * 0.32)), Math.max(1, Math.round(size * 0.1)));
  ctx.fillRect(x0 + bevel, x0 + bevel, Math.max(1, Math.round(size * 0.1)), Math.max(1, Math.round(size * 0.22)));
  if (palette.patterns) drawPattern(ctx, rgb, cell, x0, size);
  drawLevelLayers(ctx, rgb, level, x0, size, bevel, { mono: palette.mono === true, glass: false, highlight: parseHex(palette.highlight ?? WHITE) });
}

/**
 * 칸 값·크기(CSS px)·DPR·블록 스킨·레벨에 맞는 스프라이트. DOM이 없으면 null (호출 쪽이 단색으로 그린다)
 */
export function getBlockSprite(cell: number, size: number, dpr: number, skin: string = DEFAULT_SKIN_ID, level = 1): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const px = Math.max(2, Math.round(size * dpr));
  // 가비지는 레벨 레이어를 그리지 않는다 — 레벨마다 같은 그림을 따로 굽지 않게
  const key = spriteKey(px, cell, skin, cell === GARBAGE_CELL_VALUE ? 1 : level);
  const cached = blockCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  drawSprite(ctx, px, cell, skin, spriteLevel(level));
  if (blockCache.size >= CACHE_LIMIT) blockCache.clear();
  blockCache.set(key, canvas);
  return canvas;
}

/** 발광 스프라이트 여백 — 칸 둘레로 번지는 폭(칸 크기 비율) */
export const GLOW_SPREAD = 0.5;

function drawGlowSprite(ctx: CanvasRenderingContext2D, px: number, cellPx: number, cell: number, skin: string): void {
  const pad = (px - cellPx) / 2;
  const palette = blockSkin(skin);
  const color = palette.cells[cell];
  ctx.shadowColor = color;
  ctx.shadowBlur = pad;
  ctx.fillStyle = color;
  // 그림자만 남기려고 본체는 캔버스 밖에 그리고 그림자를 안쪽으로 옮긴다
  ctx.shadowOffsetX = px * 2;
  ctx.fillRect(pad - px * 2, pad, cellPx, cellPx);
  // 유리 블록은 몸통이 비친다 — 칸 안쪽 빛은 지워 외곽선 둘레만 빛나게(몸통이 뿌옇게 차지 않게)
  if (palette.finish === 'glass') {
    const inset = Math.max(1, Math.round(cellPx * 0.12));
    ctx.clearRect(pad + inset, pad + inset, cellPx - inset * 2, cellPx - inset * 2);
  }
}

/**
 * 칸 발광 — 칸보다 GLOW_SPREAD만큼 넓은 부드러운 빛. 블록을 그리기 전에 'lighter'로 깔면 네온처럼 번진다
 * 가비지·DOM 없음은 null
 */
export function getGlowSprite(cell: number, size: number, dpr: number, skin: string = DEFAULT_SKIN_ID): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || cell === GARBAGE_CELL_VALUE || cell <= 0) return null;
  const cellPx = Math.max(2, Math.round(size * dpr));
  const px = Math.round(cellPx * (1 + GLOW_SPREAD * 2));
  const key = spriteKey(cellPx, cell, skin);
  const cached = glowCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  drawGlowSprite(ctx, px, cellPx, cell, skin);
  if (glowCache.size >= CACHE_LIMIT) glowCache.clear();
  glowCache.set(key, canvas);
  return canvas;
}

/** 칸 발광을 깐다 — 호출 쪽이 globalCompositeOperation('lighter')·globalAlpha를 정한다 */
export function drawGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  cell: number,
  dpr: number,
  skin: string = DEFAULT_SKIN_ID,
): void {
  const sprite = getGlowSprite(cell, size, dpr, skin);
  if (!sprite) return;
  const spread = size * GLOW_SPREAD;
  ctx.drawImage(sprite, x - spread, y - spread, size + spread * 2, size + spread * 2);
}

/** 칸 하나를 그린다 — 스프라이트가 없으면 단색 */
export function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  cell: number,
  dpr: number,
  alpha = 1,
  skin: string = DEFAULT_SKIN_ID,
  level = 1,
): void {
  ctx.globalAlpha = alpha;
  const sprite = getBlockSprite(cell, size, dpr, skin, level);
  if (sprite) {
    ctx.drawImage(sprite, x, y, size, size);
  } else {
    ctx.fillStyle = blockSkin(skin).cells[cell];
    ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
  }
  ctx.globalAlpha = 1;
}
