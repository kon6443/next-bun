import { BOARD_WIDTH, HIDDEN_ROWS, VISIBLE_ROWS } from '../engine';
import { type EffectTracker, RING_LIFE_FRAMES } from './effects';
import type { EffectSkin } from './skins';

/**
 * 스킨 레벨 강화 레이어(skin-levels D-001) — 테마와 무관하게 모든 아이템에 같은 레이어를 얹는다. 색만 그 판의 스킨에서
 * - 멈춘 레이어(구운 블록 무늬·판 모서리·격자 점·판 그라데이션)는 늘 그린다
 * - 움직이는 레이어(샤인·반짝임·오로라·테두리 빛·불꽃)는 animate일 때만 — 연출 줄이기·저사양(lite)·게임 끝에는 멈춘 레이어만
 * 블록 Lv2~5의 구운 무늬는 blockSprites(drawLevelLayers), 연출 Lv2~4는 effectsRenderer 안(겹 충격파·번쩍임·문구)
 * 비용: 매 프레임 그리는 것은 조작 중 블록 4칸·반짝임 상한 몇 개·선 몇 개 — 칸 수에 비례하는 그림은 스프라이트로 굽는다
 */

/** 판 그리기에 필요한 값 — renderer.ts의 BoardLayout과 같은 모양 */
type BoardRect = { cell: number; boardX: number; boardY: number };

const rowToY = (rect: BoardRect, row: number) => rect.boardY + (row - HIDDEN_ROWS) * rect.cell;

/** #rrggbb → rgba() */
export function withAlpha(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(value >> 16) & 0xff}, ${(value >> 8) & 0xff}, ${value & 0xff}, ${alpha})`;
}

/** 0~1 해시 — 위치를 상태 없이 같은 값으로 */
function hash01(n: number): number {
  const x = Math.sin(n * 91.7 + 47.3) * 43758.5453;
  return x - Math.floor(x);
}

/** 레벨별 칸 발광 배율 — Lv3부터 글로우가 확실히 진해진다(D-003 — 한눈에 구분) */
export const glowBoost = (blockLevel: number) => (blockLevel >= 5 ? 2 : blockLevel >= 3 ? 1.7 : 1);

/** 레벨별 판 테두리 발광 폭 — Lv3부터 넓게 */
export const frameBlur = (boardLevel: number, reduced: boolean) => (reduced ? 4 : boardLevel >= 3 ? 24 : 14);

/** 레벨별 배경 별 밀도 배율 — Lv5는 2배 */
export const starDensity = (boardLevel: number) => (boardLevel >= 5 ? 2 : 1);

// ==================== block ====================

/** 샤인 주기·지나가는 시간(프레임) */
const SHINE_PERIOD = 80;
const SHINE_FRAMES = 32;

/**
 * Lv4+ 샤인 — 조작 중인 블록 위로 사선 빛이 주기적으로 지나간다
 * cells = 블록 칸 오프셋(PIECE_CELLS 형식 [x0, y0, x1, y1, …]), (originX, originY) = 오프셋 0,0 칸의 왼쪽 위(캔버스 px)
 * minRow = 이보다 위(오프셋 y < minRow) 칸은 생성 줄 위로 잘려 그리지 않는다 — 매 프레임 좌표 배열을 만들지 않게 오프셋을 그대로 받는다
 */
export function drawBlockShine(
  ctx: CanvasRenderingContext2D,
  cells: ArrayLike<number>,
  originX: number,
  originY: number,
  minRow: number,
  size: number,
  frame: number,
  /** 하이라이트 색(#rrggbb) — 블록 스킨의 highlight(초콜릿은 캐러멜) */
  color = '#ffffff',
): void {
  const age = frame % SHINE_PERIOD;
  if (age >= SHINE_FRAMES) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < cells.length; i += 2) {
    if (cells[i + 1] < minRow) continue;
    const x = originX + cells[i] * size;
    const y = originY + cells[i + 1] * size;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + size);
    maxY = Math.max(maxY, y + size);
  }
  if (minX === Infinity) return;
  const span = maxX - minX + (maxY - minY);
  const t = age / SHINE_FRAMES;
  const center = minX + minY - size + (span + size * 2) * t;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < cells.length; i += 2) {
    if (cells[i + 1] >= minRow) ctx.rect(originX + cells[i] * size, originY + cells[i + 1] * size, size, size);
  }
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  // x + y = center 인 사선 둘레의 띠
  const band = ctx.createLinearGradient(center / 2 - size, center / 2 - size, center / 2 + size, center / 2 + size);
  band.addColorStop(0, withAlpha(color, 0));
  band.addColorStop(0.5, withAlpha(color, 0.7));
  band.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = band;
  ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  ctx.restore();
}

/** 반짝임 상한·한 반짝임의 길이(프레임) */
const TWINKLE_COUNT = 10;
const TWINKLE_FRAMES = 40;

/**
 * Lv5+ 반짝임 — 쌓인 칸 위에 작은 별이 몇 개 반짝였다 사라진다(자리는 프레임 구간 해시 — 상태 없음)
 */
export function drawBlockTwinkles(ctx: CanvasRenderingContext2D, board: ArrayLike<number>, rect: BoardRect, frame: number, color = '#ffffff'): void {
  const { cell, boardX } = rect;
  const cells = BOARD_WIDTH * VISIBLE_ROWS;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = color;
  for (let i = 0; i < TWINKLE_COUNT; i++) {
    // 반짝임마다 시작을 어긋나게 — 한꺼번에 깜빡이지 않게
    const shifted = frame + i * (TWINKLE_FRAMES / TWINKLE_COUNT) * 1.7;
    const slot = Math.floor(shifted / TWINKLE_FRAMES);
    const age = shifted - slot * TWINKLE_FRAMES;
    // 빈칸이면 몇 번 더 찾아본다(쌓인 칸이 적으면 덜 반짝인다)
    let index = -1;
    for (let k = 0; k < 4 && index < 0; k++) {
      const pick = Math.floor(hash01(slot * 13 + i * 7 + k * 101) * cells);
      // 블록 칸만(가비지 8은 빼고)
      const value = board[HIDDEN_ROWS * BOARD_WIDTH + pick];
      if (value >= 1 && value <= 7) index = pick;
    }
    if (index < 0) continue;
    const col = index % BOARD_WIDTH;
    const row = HIDDEN_ROWS + Math.floor(index / BOARD_WIDTH);
    const life = Math.sin((age / TWINKLE_FRAMES) * Math.PI);
    const r = cell * 0.38 * life;
    if (r < 0.5) continue;
    const cx = boardX + col * cell + cell * (0.3 + 0.4 * hash01(slot + i));
    const cy = rowToY(rect, row) + cell * (0.3 + 0.4 * hash01(slot * 3 + i));
    ctx.globalAlpha = 0.85 * life;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx, cy, cx + r, cy);
    ctx.quadraticCurveTo(cx, cy, cx, cy + r);
    ctx.quadraticCurveTo(cx, cy, cx - r, cy);
    ctx.quadraticCurveTo(cx, cy, cx, cy - r);
    ctx.fill();
  }
  ctx.restore();
}

// ==================== board ====================

/** 판 칸 수 — 기본 인자를 매 프레임 새 객체로 만들지 않게 */
const BOARD_GRID = { columns: BOARD_WIDTH, rows: VISIBLE_ROWS } as const;

/** 오로라 띠·테두리 빛 한 바퀴(프레임) */
const AURORA_PERIOD = 600;
const RUNNER_PERIOD = 360;

/**
 * 보드 레벨 레이어 — 판 배경·격자 위, 블록 아래에 그린다. color = 지금 레벨 네온(#rrggbb)
 * Lv2 모서리 브래킷 · Lv3 격자 교차점 · Lv4 위에서 내려오는 빛 그라데이션(+움직이는 오로라 띠) · Lv5 테두리를 도는 빛
 */
export function drawBoardLevelLayer(
  ctx: CanvasRenderingContext2D,
  rect: BoardRect,
  boardWidth: number,
  boardHeight: number,
  color: string,
  level: number,
  frame: number,
  animate: boolean,
  /** 칸 수 — 스킨 미리보기는 판 모양이 아니라 넘긴다 */
  grid: { readonly columns: number; readonly rows: number } = BOARD_GRID,
): void {
  if (level < 2) return;
  const { cell, boardX, boardY } = rect;
  ctx.save();
  if (level >= 4) {
    const glow = ctx.createLinearGradient(0, boardY, 0, boardY + boardHeight * 0.6);
    glow.addColorStop(0, withAlpha(color, 0.22));
    glow.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(boardX, boardY, boardWidth, boardHeight * 0.6);
    if (animate) {
      // 오로라 — 넓고 옅은 띠가 판을 천천히 오르내린다
      const t = (Math.sin(((frame % AURORA_PERIOD) / AURORA_PERIOD) * Math.PI * 2) + 1) / 2;
      const y = boardY + boardHeight * (0.15 + 0.7 * t);
      const h = cell * 5;
      const band = ctx.createLinearGradient(0, y - h, 0, y + h);
      band.addColorStop(0, withAlpha(color, 0));
      band.addColorStop(0.5, withAlpha(color, 0.18));
      band.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = band;
      ctx.fillRect(boardX, Math.max(boardY, y - h), boardWidth, Math.min(h * 2, boardY + boardHeight - Math.max(boardY, y - h)));
    }
  }
  if (level >= 3) {
    // 격자 교차점 — 한 번의 fill로
    const dot = Math.max(2, cell * 0.11);
    ctx.fillStyle = withAlpha(color, 0.5);
    ctx.beginPath();
    for (let x = 1; x < grid.columns; x++) {
      for (let y = 1; y < grid.rows; y++) ctx.rect(boardX + x * cell - dot / 2 + 0.5, boardY + y * cell - dot / 2 + 0.5, dot, dot);
    }
    ctx.fill();
  }
  // 모서리 브래킷 — 판 바깥 테두리 둘레(블록을 덮지 않게 테두리 밖으로 2px)
  const arm = cell * 1.6;
  const inset = 4;
  const left = boardX - inset;
  const top = boardY - inset;
  const right = boardX + boardWidth + inset;
  const bottom = boardY + boardHeight + inset;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 3;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(left, top + arm);
  ctx.lineTo(left, top);
  ctx.lineTo(left + arm, top);
  ctx.moveTo(right - arm, top);
  ctx.lineTo(right, top);
  ctx.lineTo(right, top + arm);
  ctx.moveTo(right, bottom - arm);
  ctx.lineTo(right, bottom);
  ctx.lineTo(right - arm, bottom);
  ctx.moveTo(left + arm, bottom);
  ctx.lineTo(left, bottom);
  ctx.lineTo(left, bottom - arm);
  ctx.stroke();
  if (level >= 5 && animate) drawFrameRunner(ctx, left, top, right - left, bottom - top, color, frame);
  ctx.restore();
}

/** Lv5 테두리 빛 — 밝은 점 둘이 판 둘레를 마주 보며 돈다(꼬리는 점 몇 개). 매 프레임이라 배열·튜플을 만들지 않는다 */
function drawFrameRunner(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, frame: number): void {
  const p = 2 * (w + h);
  const head = ((frame % RUNNER_PERIOD) / RUNNER_PERIOD) * p;
  ctx.globalCompositeOperation = 'lighter';
  // 점 둘(반 바퀴 떨어짐) × 머리 + 꼬리 5
  for (let n = 0; n < 12; n++) {
    const k = n % 6;
    // 둘레 위 거리 → 점 (시계 방향, 왼쪽 위에서 시작)
    let s = (((head + (n < 6 ? 0 : p / 2) - k * 7) % p) + p) % p;
    let px: number;
    let py: number;
    if (s < w) {
      px = x + s;
      py = y;
    } else if ((s -= w) < h) {
      px = x + w;
      py = y + s;
    } else if ((s -= h) < w) {
      px = x + w - s;
      py = y + h;
    } else {
      s -= w;
      px = x;
      py = y + h - s;
    }
    const r = 4.5 - k * 0.6;
    ctx.globalAlpha = 1 - k * 0.15;
    ctx.fillStyle = k === 0 ? '#ffffff' : color;
    ctx.fillRect(px - r, py - r, r * 2, r * 2);
  }
}

// ==================== effect ====================

const SPARK_COUNT = 28;

/**
 * 연출 Lv5 — 줄 삭제 불꽃(지운 줄에서 사방으로 튀는 테마색 불꽃, 충격파 이벤트로 계산 — 상태 없음)
 * 큰 삭제(테트리스 등)면 판 가장자리가 안쪽으로 한 번 빛난다
 */
export function drawClearSparks(
  ctx: CanvasRenderingContext2D,
  fx: EffectTracker | null,
  frame: number,
  rect: BoardRect,
  boardWidth: number,
  boardHeight: number,
  effect: EffectSkin,
): void {
  const ring = fx?.ring;
  if (!ring) return;
  const age = frame - ring.frame;
  if (age < 0 || age >= RING_LIFE_FRAMES) return;
  const { cell, boardX, boardY } = rect;
  const life = 1 - age / RING_LIFE_FRAMES;
  const cy = rowToY(rect, ring.row) + cell / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(boardX - cell, boardY - cell, boardWidth + cell * 2, boardHeight + cell * 2);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < SPARK_COUNT; i++) {
    const seed = ring.frame * 31 + i;
    const angle = hash01(seed) * Math.PI * 2;
    const speed = cell * (0.12 + 0.18 * hash01(seed + 7));
    const x = boardX + boardWidth * hash01(seed + 3) + Math.cos(angle) * speed * age;
    const y = cy + Math.sin(angle) * speed * age + 0.01 * cell * age * age;
    const r = Math.max(1, cell * 0.12 * life);
    ctx.globalAlpha = life;
    ctx.fillStyle = effect.tierColors[1 + (i % 4)];
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  if (ring.big) {
    // 판 가장자리 안쪽으로 얇게 — 쌓인 블록을 덮지 않게
    const edge = cell * 0.6;
    ctx.globalAlpha = 0.35 * life;
    ctx.strokeStyle = effect.ring.big;
    ctx.lineWidth = edge * life;
    ctx.strokeRect(boardX + (edge * life) / 2, boardY + (edge * life) / 2, boardWidth - edge * life, boardHeight - edge * life);
  }
  ctx.restore();
}
