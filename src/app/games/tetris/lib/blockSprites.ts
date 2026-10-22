/**
 * 입체 블록 스프라이트 — 베벨(밝은 위·왼쪽, 어두운 아래·오른쪽)·세로 그라데이션·광택·네온 테두리를 칸 크기별로 한 번만 그려 둔다
 * 매 프레임 칸마다 그라데이션을 만들지 않고 drawImage로 복사한다 (판 200칸 + 미리보기)
 * 발광(글로우)도 같은 방식 — shadowBlur는 스프라이트를 만들 때 한 번만 쓰고, 매 프레임은 복사만 한다(모바일 fps)
 */

/** 칸 값(0 빈칸 · 1~7 블록 종류 + 1 · 8 가비지) → 색. 블록 색은 가이드라인 순서 I J L O S T Z */
export const CELL_COLORS: readonly string[] = [
  '#000000',
  '#22d3ee',
  '#3b82f6',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#a855f7',
  '#ef4444',
  '#64748b',
];

/** 대전 가비지 칸 값 — 블록 값 1~7과 구분 (대전 래퍼 GARBAGE_CELL과 같은 값) */
export const GARBAGE_CELL_VALUE = 8;

/** 크기가 바뀔 때마다 새로 만들므로 상한을 두고 넘으면 비운다 */
const CACHE_LIMIT = 96;
const cache = new Map<string, HTMLCanvasElement>();

type Rgb = [number, number, number];

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

function drawSprite(ctx: CanvasRenderingContext2D, px: number, cell: number): void {
  const rgb = parseHex(CELL_COLORS[cell]);
  const garbage = cell === GARBAGE_CELL_VALUE;
  const gap = Math.max(1, Math.round(px * 0.04));
  const x0 = gap;
  const x1 = px - gap;
  const size = x1 - x0;
  const bevel = Math.max(1, Math.round(size * 0.14));

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
  // 네온 테두리 — 밝은 같은 색 선이 블록 둘레를 감싼다
  ctx.strokeStyle = shade(rgb, 0.55);
  ctx.lineWidth = Math.max(1, Math.round(size * 0.06));
  const inset = ctx.lineWidth / 2;
  ctx.strokeRect(x0 + inset, x0 + inset, size - ctx.lineWidth, size - ctx.lineWidth);
  // 광택 — 왼쪽 위 안쪽에 짧은 하이라이트
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.fillRect(x0 + bevel, x0 + bevel, Math.max(1, Math.round(size * 0.32)), Math.max(1, Math.round(size * 0.1)));
  ctx.fillRect(x0 + bevel, x0 + bevel, Math.max(1, Math.round(size * 0.1)), Math.max(1, Math.round(size * 0.22)));
}

/**
 * 칸 값·크기(CSS px)·DPR에 맞는 스프라이트. DOM이 없으면 null (호출 쪽이 단색으로 그린다)
 */
export function getBlockSprite(cell: number, size: number, dpr: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const px = Math.max(2, Math.round(size * dpr));
  const key = `${cell}:${px}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  drawSprite(ctx, px, cell);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, canvas);
  return canvas;
}

/** 발광 스프라이트 여백 — 칸 둘레로 번지는 폭(칸 크기 비율) */
export const GLOW_SPREAD = 0.5;

function drawGlowSprite(ctx: CanvasRenderingContext2D, px: number, cellPx: number, cell: number): void {
  const pad = (px - cellPx) / 2;
  ctx.shadowColor = CELL_COLORS[cell];
  ctx.shadowBlur = pad;
  ctx.fillStyle = CELL_COLORS[cell];
  // 그림자만 남기려고 본체는 캔버스 밖에 그리고 그림자를 안쪽으로 옮긴다
  ctx.shadowOffsetX = px * 2;
  ctx.fillRect(pad - px * 2, pad, cellPx, cellPx);
}

/**
 * 칸 발광 — 칸보다 GLOW_SPREAD만큼 넓은 부드러운 빛. 블록을 그리기 전에 'lighter'로 깔면 네온처럼 번진다
 * 가비지·DOM 없음은 null
 */
export function getGlowSprite(cell: number, size: number, dpr: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || cell === GARBAGE_CELL_VALUE || cell <= 0) return null;
  const cellPx = Math.max(2, Math.round(size * dpr));
  const px = Math.round(cellPx * (1 + GLOW_SPREAD * 2));
  const key = `glow:${cell}:${cellPx}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  drawGlowSprite(ctx, px, cellPx, cell);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, canvas);
  return canvas;
}

/** 칸 발광을 깐다 — 호출 쪽이 globalCompositeOperation('lighter')·globalAlpha를 정한다 */
export function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, cell: number, dpr: number): void {
  const sprite = getGlowSprite(cell, size, dpr);
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
): void {
  ctx.globalAlpha = alpha;
  const sprite = getBlockSprite(cell, size, dpr);
  if (sprite) {
    ctx.drawImage(sprite, x, y, size, size);
  } else {
    ctx.fillStyle = CELL_COLORS[cell];
    ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
  }
  ctx.globalAlpha = 1;
}
