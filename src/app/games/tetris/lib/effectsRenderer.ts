import { HIDDEN_ROWS, PIECE_CELLS } from '../engine';
import { CELL_COLORS } from './blockSprites';
import {
  type EffectTracker,
  LEVEL_FADE_FRAMES,
  PARTICLE_LIFE_FRAMES,
  TEXT_LIFE_FRAMES,
  TRAIL_LIFE_FRAMES,
} from './effects';

/**
 * 연출 그리기 — effects.ts가 기록한 이벤트를 지금 엔진 프레임 기준 나이로 그린다
 * 연출 줄이기(reduced)면 움직임(흔들림·파티클·잔상·확대)을 그리지 않고 문구·색 전환만 정적으로 보인다
 */

/** 판 그리기에 필요한 값 — renderer.ts의 BoardLayout과 같은 모양 */
type BoardRect = { cell: number; boardX: number; boardY: number };

/** 파티클 중력 (칸/프레임²) */
const PARTICLE_GRAVITY = 0.02;
const TEXT_FADE_FRAMES = 15;
/** 콤보 단계별 문구 색 — 0(기본) ~ 4(11콤보 이상) */
const TIER_COLORS = ['#e2e8f0', '#7dd3fc', '#c4b5fd', '#fcd34d', '#fb7185'];

/** 레벨별 판 배경 — 10레벨 주기로 돈다 */
const LEVEL_TINTS: readonly [number, number, number][] = [
  [15, 23, 42],
  [16, 30, 78],
  [36, 22, 82],
  [58, 18, 74],
  [70, 16, 52],
  [72, 22, 30],
  [66, 38, 16],
  [40, 52, 18],
  [14, 56, 40],
  [12, 48, 70],
];

const rowToY = (rect: BoardRect, row: number) => rect.boardY + (row - HIDDEN_ROWS) * rect.cell;

function tintFor(level: number): [number, number, number] {
  return LEVEL_TINTS[(level - 1) % LEVEL_TINTS.length];
}

/** 판 배경색 — 레벨이 오르면 LEVEL_FADE_FRAMES 동안 새 색으로 넘어간다 */
export function boardBackground(fx: EffectTracker | null, level: number, frame: number, reduced: boolean): string {
  let [r, g, b] = tintFor(level);
  const change = fx?.level;
  if (change && !reduced && change.to === level) {
    const age = frame - change.frame;
    if (age >= 0 && age < LEVEL_FADE_FRAMES) {
      const from = tintFor(change.from);
      const t = age / LEVEL_FADE_FRAMES;
      r = Math.round(from[0] + (r - from[0]) * t);
      g = Math.round(from[1] + (g - from[1]) * t);
      b = Math.round(from[2] + (b - from[2]) * t);
    }
  }
  return `rgba(${r}, ${g}, ${b}, 0.92)`;
}

/** 레벨업 직후 판 테두리가 밝게 빛났다가 사라진다 */
export function drawLevelGlow(
  ctx: CanvasRenderingContext2D,
  fx: EffectTracker | null,
  frame: number,
  rect: BoardRect,
  boardWidth: number,
  boardHeight: number,
) {
  const change = fx?.level;
  if (!change) return;
  const age = frame - change.frame;
  if (age < 0 || age >= LEVEL_FADE_FRAMES) return;
  const { boardX, boardY } = rect;
  ctx.save();
  ctx.globalAlpha = 1 - age / LEVEL_FADE_FRAMES;
  ctx.strokeStyle = '#7dd3fc';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 12;
  ctx.strokeRect(boardX - 1.5, boardY - 1.5, boardWidth + 3, boardHeight + 3);
  ctx.restore();
}

/** 화면 흔들림 오프셋(px, 정수) — 감쇠 진동 */
export function shakeOffset(fx: EffectTracker | null, frame: number, reduced: boolean): [number, number] {
  const shake = fx?.shake;
  if (!shake || reduced) return [0, 0];
  const age = frame - shake.frame;
  if (age < 0 || age >= shake.duration) return [0, 0];
  const decay = 1 - age / shake.duration;
  return [
    Math.round(Math.sin(age * 2.7) * shake.magnitude * decay),
    Math.round(Math.cos(age * 3.3) * shake.magnitude * decay * 0.6),
  ];
}

/** 하드 드롭 잔상 — 블록이 지나간 열을 따라 아래로 짙어지는 빛줄기 */
export function drawTrail(ctx: CanvasRenderingContext2D, fx: EffectTracker | null, frame: number, rect: BoardRect, firstRow: number) {
  const trail = fx?.trail;
  if (!trail) return;
  const age = frame - trail.frame;
  if (age < 0 || age >= TRAIL_LIFE_FRAMES) return;
  const { cell, boardX } = rect;
  const cells = PIECE_CELLS[trail.piece][trail.rotation];
  // 열마다 그 열의 가장 위 칸 기준
  const columns = new Map<number, [number]>();
  for (let i = 0; i < 8; i += 2) {
    const col = cells[i];
    const row = cells[i + 1];
    const top = columns.get(col);
    columns.set(col, [top ? Math.min(top[0], row) : row]);
  }
  const alpha = 0.7 * (1 - age / TRAIL_LIFE_FRAMES);
  const color = CELL_COLORS[trail.piece + 1];
  for (const [col, [top]] of columns) {
    const startRow = Math.max(firstRow, trail.fromY + top);
    // 착지한 블록은 덮지 않는다 — 그 열의 가장 위 칸 윗변까지
    const endRow = trail.toY + top;
    if (endRow <= startRow) continue;
    const y0 = rowToY(rect, startRow);
    const y1 = rowToY(rect, endRow);
    const gradient = ctx.createLinearGradient(0, y0, 0, y1);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(1, color);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = gradient;
    ctx.fillRect(boardX + (trail.x + col) * cell + cell * 0.15, y0, cell * 0.7, y1 - y0);
  }
  ctx.globalAlpha = 1;
}

/** 줄 삭제 조각 — 시작 위치·속도로 지금 위치를 계산한다(프레임마다 갱신하지 않음). 수명이 끝난 것은 여기서 버린다 */
export function drawParticles(
  ctx: CanvasRenderingContext2D,
  fx: EffectTracker | null,
  frame: number,
  rect: BoardRect,
  boardWidth: number,
  boardHeight: number,
) {
  if (!fx || fx.particles.length === 0) return;
  const { cell, boardX, boardY } = rect;
  // 판 둘레 1칸까지만 — 옆 패널(홀드·다음)을 가리지 않게
  ctx.save();
  ctx.beginPath();
  ctx.rect(boardX - cell, boardY - cell, boardWidth + cell * 2, boardHeight + cell * 2);
  ctx.clip();
  let expired = 0;
  for (const p of fx.particles) {
    const age = frame - p.frame;
    if (age >= PARTICLE_LIFE_FRAMES) {
      expired++;
      continue;
    }
    if (age < 0) continue;
    const x = p.x + p.vx * age;
    const y = p.y + p.vy * age + 0.5 * PARTICLE_GRAVITY * age * age;
    const size = p.size * cell;
    ctx.globalAlpha = 1 - age / PARTICLE_LIFE_FRAMES;
    ctx.fillStyle = CELL_COLORS[p.cell];
    ctx.fillRect(boardX + x * cell - size / 2, rowToY(rect, y) - size / 2, size, size);
  }
  ctx.restore();
  if (expired === fx.particles.length) fx.particles.length = 0;
}

/** 줄 삭제 번쩍임 — 지연 프레임 동안 흰빛이 사라지고, 큰 삭제는 위아래로 번진다 */
export function drawClearFlash(
  ctx: CanvasRenderingContext2D,
  rows: readonly number[],
  progress: number,
  big: boolean,
  rect: BoardRect,
  boardWidth: number,
  reduced: boolean,
) {
  const alpha = Math.max(0, Math.min(1, progress));
  const { cell, boardX } = rect;
  for (const row of rows) {
    const y = rowToY(rect, row);
    if (!reduced) {
      const spread = cell * (big ? 0.6 : 0.3) * (1 - alpha);
      ctx.fillStyle = `rgba(186, 230, 253, ${0.35 * alpha})`;
      ctx.fillRect(boardX, y - spread, boardWidth, cell + spread * 2);
    }
    ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * alpha})`;
    ctx.fillRect(boardX, y, boardWidth, cell);
  }
}

/** 삭제 이름·B2B·콤보·레벨 문구 — 판 위쪽 가운데. 콤보 단계가 높을수록 크고 색이 바뀐다 */
export function drawEffectText(
  ctx: CanvasRenderingContext2D,
  fx: EffectTracker | null,
  frame: number,
  rect: BoardRect,
  boardWidth: number,
  reduced: boolean,
) {
  const burst = fx?.text;
  if (!burst) return;
  const age = frame - burst.frame;
  if (age < 0 || age >= TEXT_LIFE_FRAMES) return;
  const { cell, boardX, boardY } = rect;
  const fadeStart = TEXT_LIFE_FRAMES - TEXT_FADE_FRAMES;
  const alpha = age > fadeStart ? (TEXT_LIFE_FRAMES - age) / TEXT_FADE_FRAMES : 1;
  const pop = reduced ? 1 : 1 + 0.35 * Math.max(0, 1 - age / 8);
  const rise = reduced ? 0 : age * 0.03 * cell;
  const centerX = boardX + boardWidth / 2;
  let y = boardY + cell * 5 - rise;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const line of burst.lines) {
    const fontSize = Math.round(cell * (0.7 + 0.12 * line.tier) * pop);
    ctx.font = `800 ${fontSize}px system-ui, sans-serif`;
    ctx.lineWidth = Math.max(2, fontSize * 0.18);
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.85)';
    ctx.strokeText(line.text, centerX, y, boardWidth - cell);
    ctx.fillStyle = TIER_COLORS[Math.min(line.tier, TIER_COLORS.length - 1)];
    ctx.fillText(line.text, centerX, y, boardWidth - cell);
    y += fontSize * 1.15;
  }
  ctx.restore();
}
