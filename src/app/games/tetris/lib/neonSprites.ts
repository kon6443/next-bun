/**
 * 네온 외곽선 스프라이트 — shadowBlur 외곽선(판 테두리·고스트)을 한 번만 그려 두고 매 프레임은 drawImage로 복사한다
 * shadowBlur는 매번 가우스 흐림을 계산해 비싸다(특히 Safari) — blockSprites의 칸 발광과 같은 방식
 * 굽는 법: 원래와 같은 globalAlpha·lineWidth·shadowBlur로 빈 캔버스에 그린다. source-over는 결합 법칙이 성립해 복사한 결과가 직접 그린 것과 같다
 * shadowBlur는 변환 행렬의 영향을 받지 않는다(장치 픽셀) — 스프라이트도 같은 DPR 배율로 그려 흐림 폭을 맞춘다
 * 복사는 장치 px 정수 자리에 1:1로(보간 없음) — 그릴 자리의 장치 px 소수 부분(phase)까지 같게 구워 둔다. DPR이 1.5·확대처럼 소수여도 직접 그린 것과 같다
 * 키는 그림을 정하는 값 전부(색·흐림·크기·DPR·phase) — 색은 판 주인 스킨과 레벨에서, 크기는 computeLayout 결과에서 온다. 위치는 매 프레임 넘겨받아 캐시와 무관하다
 * 스프라이트를 못 쓰면(DOM 없음·캔버스 생성 실패·회전 변환·굽기 예산 초과) false — 호출 쪽이 원래대로 직접 그린다
 */

/** 외곽선 굵기·불투명도 — 테두리·고스트가 원래 쓰던 값 */
export const NEON_LINE_WIDTH = 1.5;
export const NEON_ALPHA = 0.85;

/** 판 테두리 — 띠 4개 합쳐 항목당 DPR 2에서 약 0.7MB, DPR 3에서 약 1.5MB. 가장 오래 안 쓴 것부터 버린다(레벨 색이 바뀌면 새로 만든다) */
const FRAME_CACHE_LIMIT = 8;
/** 고스트 — 블록 7종 × 회전 4 × phase(소수 DPR이면 여러 가지) × 스킨·크기. 가장 오래 안 쓴 것부터 버린다 */
const GHOST_CACHE_LIMIT = 96;
/**
 * 굽기 예산 — 1초에 이만큼만 새로 굽고, 넘으면 그 프레임은 직접 그린다(옛 방식과 같은 비용)
 * 소수 DPR(확대 110%·Windows 125% 등)에서 판이 흔들리면 phase가 프레임마다 바뀐다 — 그때마다 굽느라 옛 방식보다 느려지지 않게
 */
const BAKES_PER_SECOND = 8;
let bakeWindowStart = -Infinity;
let bakesInWindow = 0;
/** 캔버스를 못 만든 적이 있으면(메모리 한도 등) 이후로는 굽지 않고 직접 그린다 — 매 프레임 다시 만들어 보지 않게 */
let bakingDisabled = false;

function takeBake(): boolean {
  if (bakingDisabled) return false;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - bakeWindowStart >= 1000) {
    bakeWindowStart = now;
    bakesInWindow = 0;
  }
  if (bakesInWindow >= BAKES_PER_SECOND) return false;
  bakesInWindow++;
  return true;
}

/** 캐시에서 꺼낸다 — 꺼낸 것은 맨 뒤로(가장 최근에 쓴 것) 옮긴다 */
function lookup<T>(cache: Map<string, T>, key: string): T | undefined {
  const value = cache.get(key);
  if (value !== undefined) {
    cache.delete(key);
    cache.set(key, value);
  }
  return value;
}

/** 버리는 캔버스의 메모리를 바로 돌려준다 — iOS Safari는 캔버스 메모리 총량 한도가 있고 GC를 기다리면 늦다 */
function release(strips: Strip | Strip[]): void {
  for (const strip of Array.isArray(strips) ? strips : [strips]) {
    strip.canvas.width = 0;
    strip.canvas.height = 0;
  }
}

/** 넣는다 — 상한이면 가장 오래 안 쓴 것(맨 앞)을 버린다 */
function store<T extends Strip | Strip[]>(cache: Map<string, T>, key: string, value: T, limit: number): void {
  if (cache.size >= limit) {
    const [oldestKey, oldest] = cache.entries().next().value as [string, T];
    cache.delete(oldestKey);
    release(oldest);
  }
  cache.set(key, value);
}

/** 구운 캔버스와 그 왼쪽 위의 자리 — 그릴 자리의 장치 px 정수 위치(ix, iy)에서 떨어진 장치 px(정수) */
type Strip = { canvas: HTMLCanvasElement; x: number; y: number };

/**
 * phase 단위 — 백만분의 1 장치 px(부동소수 잡음만 지운다)
 * 더 거칠게 반올림하면 DPR 1.1처럼 이진 소수로 떨어지지 않는 배율에서 선 가장자리가 안티앨리어싱 표본 자리를 넘나들어 직접 그린 것과 달라진다(Chromium 실측)
 * 판 좌표는 정수 CSS px라 실제 phase 가짓수는 DPR이 정한다(1·2 → 1가지, 1.5 → 2가지, 1.1 → 10가지)
 */
const PHASE_STEPS = 1_000_000;

type Placement = { dpr: number; ix: number; iy: number; fx: number; fy: number };

/**
 * CSS 좌표 (x, y)가 놓일 장치 px — 정수 부분과 소수 부분(phase)
 * 회전·기울임이 걸린 변환이면 null(이 게임은 쓰지 않는다 — 호출 쪽이 직접 그린다)
 */
function placementOf(ctx: CanvasRenderingContext2D, x: number, y: number): Placement | null {
  if (typeof ctx.getTransform !== 'function') return null;
  const m = ctx.getTransform();
  if (m.b || m.c || !(m.a > 0) || m.a !== (m.d ?? m.a)) return null;
  const split = (value: number) => {
    const whole = Math.floor(value);
    const phase = Math.round((value - whole) * PHASE_STEPS) / PHASE_STEPS;
    return phase === 1 ? [whole + 1, 0] : [whole, phase];
  };
  const [ix, fx] = split(m.a * x + (m.e ?? 0));
  const [iy, fy] = split(m.a * y + (m.f ?? 0));
  return { dpr: m.a, ix, iy, fx, fy };
}

/** 구운 캔버스를 장치 px 정수 자리에 1:1로 복사한다(변환만 잠시 풀고 그림자는 끈다 — 발광은 이미 구워져 있다. 클립·투명도·합성은 그대로) */
function blit(ctx: CanvasRenderingContext2D, at: Placement, sprite: Strip): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
  ctx.drawImage(sprite.canvas, at.ix + sprite.x, at.iy + sprite.y);
  ctx.restore();
}

const frameCache = new Map<string, Strip[]>();
const ghostCache = new Map<string, Strip>();

/** 흐림이 번지는 폭(장치 px) — 가우스 꼬리까지 담도록 흐림의 두 배 + 선 굵기 */
function padFor(blur: number, dpr: number): number {
  return Math.ceil(blur * 2 + NEON_LINE_WIDTH * dpr) + 2;
}

function createCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) bakingDisabled = true;
  return ctx ? [canvas, ctx] : null;
}

function neonStroke(ctx: CanvasRenderingContext2D, color: string, blur: number): void {
  ctx.globalAlpha = NEON_ALPHA;
  ctx.strokeStyle = color;
  ctx.lineWidth = NEON_LINE_WIDTH;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

/**
 * 판 테두리 — 테두리 둘레의 띠 4개(위·아래 전체 폭, 왼·오른쪽 나머지 높이)로 굽는다. 가운데 빈 영역은 만들지 않아 판 크기와 무관하게 메모리가 작다
 * width·height: strokeRect 크기(CSS px)
 */
function frameStrips(width: number, height: number, color: string, blur: number, at: Placement): Strip[] | null {
  const { dpr, fx, fy } = at;
  const key = `${color}|${blur}|${width}|${height}|${dpr}|${fx}|${fy}`;
  const cached = lookup(frameCache, key);
  if (cached) return cached;
  const pad = padFor(blur, dpr);
  const band = pad * 2;
  const outerWidth = Math.ceil(width * dpr + fx) + pad * 2;
  const outerHeight = Math.ceil(height * dpr + fy) + pad * 2;
  if (outerHeight <= band * 2 || outerWidth <= band * 2 || !takeBake()) return null;
  const rects = [
    [0, 0, outerWidth, band],
    [0, outerHeight - band, outerWidth, band],
    [0, band, band, outerHeight - band * 2],
    [outerWidth - band, band, band, outerHeight - band * 2],
  ];
  const strips: Strip[] = [];
  for (const [x, y, w, h] of rects) {
    const made = createCanvas(w, h);
    if (!made) {
      release(strips);
      return null;
    }
    const [canvas, ctx] = made;
    // 바깥 상자 = 테두리 왼쪽 위(장치 px ix + fx)에서 pad만큼 바깥. 띠는 그 상자의 (x, y)부터 — 테두리 전체를 그리면 띠 밖은 잘린다
    ctx.setTransform(dpr, 0, 0, dpr, pad + fx - x, pad + fy - y);
    neonStroke(ctx, color, blur);
    ctx.strokeRect(0, 0, width, height);
    strips.push({ canvas, x: x - pad, y: y - pad });
  }
  store(frameCache, key, strips, FRAME_CACHE_LIMIT);
  return strips;
}

/**
 * 네온 테두리를 그린다 — ctx.strokeRect(x, y, width, height)를 NEON_ALPHA·shadowBlur blur로 그린 것과 같다
 * @returns 스프라이트로 그렸으면 true. false면 호출 쪽이 직접 그린다
 */
export function drawNeonFrame(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string, blur: number): boolean {
  const at = placementOf(ctx, x, y);
  const strips = at && frameStrips(width, height, color, blur, at);
  if (!at || !strips) return false;
  for (const strip of strips) blit(ctx, at, strip);
  return true;
}

/**
 * 고스트 외곽선 — 블록 칸마다 rect(dx·cell + 1.5, dy·cell + 1.5, cell - 3, cell - 3)를 한 경로로 그은 것
 * cells: PIECE_CELLS[piece][rotation] (dx, dy 쌍). key는 블록·회전을 구분하는 값
 */
function ghostSprite(key: string, cells: ArrayLike<number>, cell: number, color: string, blur: number, at: Placement): Strip | null {
  const { dpr, fx, fy } = at;
  const fullKey = `${key}|${color}|${blur}|${cell}|${dpr}|${fx}|${fy}`;
  const cached = lookup(ghostCache, fullKey);
  if (cached) return cached;
  if (!takeBake()) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < cells.length; i += 2) {
    minX = Math.min(minX, cells[i]);
    maxX = Math.max(maxX, cells[i]);
    minY = Math.min(minY, cells[i + 1]);
    maxY = Math.max(maxY, cells[i + 1]);
  }
  const pad = padFor(blur, dpr);
  // 가장 왼쪽 위 칸의 장치 px 자리(블록 원점 기준, 정수로 내림) — 나머지는 굽는 변환에 넣는다
  const offsetX = Math.floor(minX * cell * dpr);
  const offsetY = Math.floor(minY * cell * dpr);
  const made = createCanvas(Math.ceil((maxX - minX + 1) * cell * dpr) + 2 + pad * 2, Math.ceil((maxY - minY + 1) * cell * dpr) + 2 + pad * 2);
  if (!made) return null;
  const [canvas, ctx] = made;
  ctx.setTransform(dpr, 0, 0, dpr, pad + fx - offsetX, pad + fy - offsetY);
  neonStroke(ctx, color, blur);
  ctx.beginPath();
  for (let i = 0; i < cells.length; i += 2) {
    ctx.rect(cells[i] * cell + 1.5, cells[i + 1] * cell + 1.5, cell - 3, cell - 3);
  }
  ctx.stroke();
  const sprite = { canvas, x: offsetX - pad, y: offsetY - pad };
  store(ghostCache, fullKey, sprite, GHOST_CACHE_LIMIT);
  return sprite;
}

/**
 * 고스트 외곽선을 그린다 — (x, y)는 블록 원점(PIECE_CELLS 0, 0 칸의 왼쪽 위, CSS px)
 * @returns 스프라이트로 그렸으면 true. false면 호출 쪽이 직접 그린다
 */
export function drawNeonGhost(
  ctx: CanvasRenderingContext2D,
  key: string,
  cells: ArrayLike<number>,
  x: number,
  y: number,
  cell: number,
  color: string,
  blur: number,
): boolean {
  const at = placementOf(ctx, x, y);
  const sprite = at && ghostSprite(key, cells, cell, color, blur, at);
  if (!at || !sprite) return false;
  blit(ctx, at, sprite);
  return true;
}

/** 테스트용 — 캐시를 비운다 */
export function __clearNeonSpritesForTests(): void {
  frameCache.clear();
  ghostCache.clear();
  bakeWindowStart = -Infinity;
  bakesInWindow = 0;
  bakingDisabled = false;
}
