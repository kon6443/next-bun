import { HIDDEN_ROWS, PIECE_CELLS, VISIBLE_ROWS } from '../engine';
import {
  type EffectTracker,
  LEVEL_FADE_FRAMES,
  PARTICLE_LIFE_FRAMES,
  RING_LIFE_FRAMES,
  RISE_FRAMES,
  TEXT_LIFE_FRAMES,
  TRAIL_LIFE_FRAMES,
} from './effects';
import { NEON_ALPHA, NEON_LINE_WIDTH, drawNeonFrame } from './neonSprites';
import { type BlockSkin, type BoardSkin, type EffectSkin, blockSkin, boardSkin, effectSkin } from './skins';

/**
 * 연출 그리기 — effects.ts가 기록한 이벤트를 지금 엔진 프레임 기준 나이로 그린다
 * 연출 줄이기(reduced)면 움직임(흔들림·파티클·잔상·확대·충격파·빛살)을 그리지 않고 문구·색 전환만 정적으로 보인다
 * 네온(2차, DESIGN §20): shadowBlur는 한 프레임에 몇 번(테두리·문구·충격파)만 — 칸마다 쓰는 발광은 blockSprites의 캐시 스프라이트
 * 색은 판 주인의 스킨 슬롯(skins.ts — 판 색은 board, 연출 색은 effect, 잔상·조각은 그 블록 색이라 block) — 생략하면 기본. 가비지 경고(빨강)는 스킨과 무관
 */

/** 그리기 품질 — lite는 저사양 감지·연출 줄이기 때 칸 발광을 끄고 별을 줄인다 */
export type EffectQuality = 'full' | 'lite';

/** 판 그리기에 필요한 값 — renderer.ts의 BoardLayout과 같은 모양 */
type BoardRect = { cell: number; boardX: number; boardY: number };

/** 파티클 중력 (칸/프레임²) */
const PARTICLE_GRAVITY = 0.02;
const TEXT_FADE_FRAMES = 15;
const DEFAULT_BLOCK = blockSkin();
const DEFAULT_EFFECT = effectSkin();
const DEFAULT_BOARD = boardSkin();

/** 레벨별 네온 색 — 판 테두리·별·레벨업 빛살. 판 배경(levelTints)과 같은 10레벨 주기 */
export function levelNeon(level: number, board: BoardSkin = DEFAULT_BOARD): string {
  const neon = board.levelNeon;
  return neon[(Math.max(1, level) - 1) % neon.length];
}

const rowToY = (rect: BoardRect, row: number) => rect.boardY + (row - HIDDEN_ROWS) * rect.cell;

/** 0~1 해시 — 별 위치를 상태 없이 프레임마다 같은 값으로 */
function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 별 개수 상한 — 화면 면적에 비례, 모바일에서도 가볍게 */
const MAX_STARS = 70;

/**
 * 배경 별·입자 흐름 — 판 뒤 캔버스 전체. 위치는 프레임으로 계산(상태 없음), 색조는 레벨 네온
 * 연출 줄이기면 움직이지 않는 별 몇 개만
 */
export function drawStarfield(
  ctx: CanvasRenderingContext2D,
  frame: number,
  level: number,
  width: number,
  height: number,
  reduced: boolean,
  quality: EffectQuality,
  board: BoardSkin = DEFAULT_BOARD,
): void {
  const count = Math.min(MAX_STARS, Math.round((width * height) / (quality === 'lite' || reduced ? 24000 : 9000)));
  if (count <= 0) return;
  const color = levelNeon(level, board);
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const depth = 0.3 + hash01(i * 3 + 1) * 0.7; // 가까운 별일수록 크고 빠르다
    const x = hash01(i * 3 + 2) * width;
    const speed = reduced ? 0 : 0.15 + depth * 0.6;
    const y = (hash01(i * 3 + 3) * height + frame * speed) % height;
    const twinkle = reduced ? 0.7 : 0.55 + 0.45 * Math.sin(frame * 0.05 + i);
    ctx.globalAlpha = 0.12 + 0.35 * depth * twinkle;
    const r = 0.6 + depth * 1.3;
    ctx.fillRect(x - r / 2, y - r / 2, r, r);
  }
  ctx.restore();
}

/** 판 네온 테두리 — 레벨 색으로 은은하게 빛난다 */
export function drawBoardFrame(
  ctx: CanvasRenderingContext2D,
  rect: BoardRect,
  boardWidth: number,
  boardHeight: number,
  level: number,
  reduced: boolean,
  board: BoardSkin = DEFAULT_BOARD,
): void {
  const { boardX, boardY } = rect;
  const color = levelNeon(level, board);
  const blur = reduced ? 4 : 14;
  // 매 프레임 그리므로 shadowBlur 대신 구워 둔 스프라이트를 복사한다(neonSprites) — 스프라이트를 못 쓰면 직접
  // 스프라이트는 투명도를 구워 두었다 — 호출 쪽 globalAlpha가 1·source-over라는 전제(drawGame). 페이드로 감싸면 두 경로가 달라진다
  if (drawNeonFrame(ctx, boardX - 1, boardY - 1, boardWidth + 2, boardHeight + 2, color, blur)) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = NEON_ALPHA;
  ctx.lineWidth = NEON_LINE_WIDTH;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.strokeRect(boardX - 1, boardY - 1, boardWidth + 2, boardHeight + 2);
  ctx.restore();
}

/** 가비지 상승 — 들어온 줄 수만큼 판 내용이 아래에서 밀려 올라온다(px, 아래로 + 오프셋이 0으로 줄어듦) */
export function riseOffset(fx: EffectTracker | null, frame: number, cell: number, reduced: boolean): number {
  const rise = fx?.rise;
  if (!rise || reduced) return 0;
  const age = frame - rise.frame;
  if (age < 0 || age >= RISE_FRAMES) return 0;
  const t = age / RISE_FRAMES;
  const ease = 1 - (1 - t) * (1 - t) * (1 - t);
  return Math.round(Math.min(rise.lines, 6) * cell * (1 - ease));
}

/** 가비지 경고 — 상승하는 동안 판 아래쪽이 붉게 빛난다 */
export function drawRiseGlow(
  ctx: CanvasRenderingContext2D,
  fx: EffectTracker | null,
  frame: number,
  rect: BoardRect,
  boardWidth: number,
  boardHeight: number,
): void {
  const rise = fx?.rise;
  if (!rise) return;
  const age = frame - rise.frame;
  if (age < 0 || age >= RISE_FRAMES * 2) return;
  const { cell, boardX, boardY } = rect;
  const h = Math.min(rise.lines + 2, 8) * cell;
  const bottom = boardY + boardHeight;
  const gradient = ctx.createLinearGradient(0, bottom - h, 0, bottom);
  const alpha = 0.45 * (1 - age / (RISE_FRAMES * 2));
  gradient.addColorStop(0, 'rgba(239, 68, 68, 0)');
  gradient.addColorStop(1, `rgba(239, 68, 68, ${alpha})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(boardX, bottom - h, boardWidth, h);
}

/** 줄 삭제 충격파 — 지운 줄 가운데에서 타원 링이 퍼지며 옅어진다. 큰 삭제는 금빛·두 겹 */
export function drawClearRing(
  ctx: CanvasRenderingContext2D,
  fx: EffectTracker | null,
  frame: number,
  rect: BoardRect,
  boardWidth: number,
  effect: EffectSkin = DEFAULT_EFFECT,
): void {
  const ring = fx?.ring;
  if (!ring) return;
  const age = frame - ring.frame;
  if (age < 0 || age >= RING_LIFE_FRAMES) return;
  const { cell, boardX } = rect;
  const t = age / RING_LIFE_FRAMES;
  const ease = 1 - (1 - t) * (1 - t);
  const cx = boardX + boardWidth / 2;
  const cy = rowToY(rect, ring.row);
  const color = ring.big ? effect.ring.big : effect.ring.normal;
  ctx.save();
  // 판 둘레 1칸까지만 — 옆 패널(홀드·다음)을 가리지 않게 (조각과 같은 범위)
  ctx.beginPath();
  ctx.rect(boardX - cell, rect.boardY - cell, boardWidth + cell * 2, cell * (VISIBLE_ROWS + 2));
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  for (let k = 0; k < (ring.big ? 2 : 1); k++) {
    const e = Math.max(0, ease - k * 0.18);
    const rx = boardWidth * (0.15 + 0.85 * e);
    ctx.globalAlpha = (1 - t) * (k === 0 ? 0.9 : 0.6);
    ctx.lineWidth = Math.max(1, cell * 0.22 * (1 - t));
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, rx * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function tintFor(level: number, board: BoardSkin): readonly [number, number, number] {
  const tints = board.levelTints;
  return tints[(level - 1) % tints.length];
}

/** 판 배경색 — 레벨이 오르면 LEVEL_FADE_FRAMES 동안 새 색으로 넘어간다 */
export function boardBackground(
  fx: EffectTracker | null,
  level: number,
  frame: number,
  reduced: boolean,
  board: BoardSkin = DEFAULT_BOARD,
): string {
  let [r, g, b] = tintFor(level, board);
  const change = fx?.level;
  if (change && !reduced && change.to === level) {
    const age = frame - change.frame;
    if (age >= 0 && age < LEVEL_FADE_FRAMES) {
      const from = tintFor(change.from, board);
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
  board: BoardSkin = DEFAULT_BOARD,
) {
  const change = fx?.level;
  if (!change) return;
  const age = frame - change.frame;
  if (age < 0 || age >= LEVEL_FADE_FRAMES) return;
  const { boardX, boardY } = rect;
  const color = levelNeon(change.to, board);
  const t = age / LEVEL_FADE_FRAMES;
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.strokeRect(boardX - 1.5, boardY - 1.5, boardWidth + 3, boardHeight + 3);
  // 레벨업 빛살 — 판 가운데에서 12갈래로 뻗는다
  const cx = boardX + boardWidth / 2;
  const cy = boardY + boardHeight / 2;
  const inner = boardWidth * 0.15 * (1 + t * 2);
  const outer = boardWidth * (0.35 + t * 0.9);
  ctx.lineWidth = Math.max(1, rect.cell * 0.18 * (1 - t));
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
  }
  ctx.stroke();
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
export function drawTrail(
  ctx: CanvasRenderingContext2D,
  fx: EffectTracker | null,
  frame: number,
  rect: BoardRect,
  firstRow: number,
  block: BlockSkin = DEFAULT_BLOCK,
) {
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
  const alpha = 0.8 * (1 - age / TRAIL_LIFE_FRAMES);
  const color = block.cells[trail.piece + 1];
  // 빛줄기 — 색 띠 위에 흰 심지, 'lighter'로 겹쳐 네온처럼
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
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
    ctx.fillRect(boardX + (trail.x + col) * cell + cell * 0.1, y0, cell * 0.8, y1 - y0);
    const core = ctx.createLinearGradient(0, y0, 0, y1);
    core.addColorStop(0, 'rgba(255, 255, 255, 0)');
    core.addColorStop(1, 'rgba(255, 255, 255, 0.9)');
    ctx.fillStyle = core;
    ctx.fillRect(boardX + (trail.x + col) * cell + cell * 0.4, y0, cell * 0.2, y1 - y0);
  }
  ctx.restore();
}

/** 줄 삭제 조각 — 시작 위치·속도로 지금 위치를 계산한다(프레임마다 갱신하지 않음). 수명이 끝난 것은 여기서 버린다 */
export function drawParticles(
  ctx: CanvasRenderingContext2D,
  fx: EffectTracker | null,
  frame: number,
  rect: BoardRect,
  boardWidth: number,
  boardHeight: number,
  block: BlockSkin = DEFAULT_BLOCK,
) {
  if (!fx || fx.particles.length === 0) return;
  const { cell, boardX, boardY } = rect;
  // 판 둘레 1칸까지만 — 옆 패널(홀드·다음)을 가리지 않게
  ctx.save();
  ctx.beginPath();
  ctx.rect(boardX - cell, boardY - cell, boardWidth + cell * 2, boardHeight + cell * 2);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
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
    const life = 1 - age / PARTICLE_LIFE_FRAMES;
    const px = boardX + x * cell;
    const py = rowToY(rect, y);
    // 빛나는 조각 — 옅은 큰 사각형(번짐) 위에 진한 작은 사각형
    ctx.globalAlpha = life * 0.35;
    ctx.fillStyle = block.cells[p.cell];
    ctx.fillRect(px - size, py - size, size * 2, size * 2);
    ctx.globalAlpha = life;
    ctx.fillRect(px - size / 2, py - size / 2, size, size);
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
  effect: EffectSkin = DEFAULT_EFFECT,
) {
  const alpha = Math.max(0, Math.min(1, progress));
  const [gr, gg, gb] = effect.flashGlow;
  const { cell, boardX } = rect;
  for (const row of rows) {
    const y = rowToY(rect, row);
    if (!reduced) {
      const spread = cell * (big ? 0.6 : 0.3) * (1 - alpha);
      ctx.fillStyle = `rgba(${gr}, ${gg}, ${gb}, ${0.35 * alpha})`;
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
  effect: EffectSkin = DEFAULT_EFFECT,
) {
  const burst = fx?.text;
  if (!burst) return;
  const age = frame - burst.frame;
  if (age < 0 || age >= TEXT_LIFE_FRAMES) return;
  const { cell, boardX, boardY } = rect;
  const fadeStart = TEXT_LIFE_FRAMES - TEXT_FADE_FRAMES;
  const alpha = age > fadeStart ? (TEXT_LIFE_FRAMES - age) / TEXT_FADE_FRAMES : 1;
  // 스케일 인 — 크게 나타나 살짝 지나쳤다가 제자리(ease-out-back)
  const t = Math.min(1, age / 10);
  const back = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
  const pop = reduced ? 1 : 1.6 - 0.6 * back;
  const rise = reduced ? 0 : Math.max(0, age - 20) * 0.025 * cell;
  const centerX = boardX + boardWidth / 2;
  let y = boardY + cell * 5 - rise;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const line of burst.lines) {
    const color = effect.tierColors[Math.min(line.tier, effect.tierColors.length - 1)];
    const fontSize = Math.round(cell * (0.7 + 0.12 * line.tier) * pop);
    ctx.font = `800 ${fontSize}px system-ui, sans-serif`;
    // 큰 이름(테트리스·T-스핀·퍼펙트·B2B)은 뒤에 빛나는 띠
    if (line.tier >= 1 && !line.text.startsWith('COMBO') && !line.text.startsWith('LEVEL')) {
      const band = ctx.createLinearGradient(boardX, 0, boardX + boardWidth, 0);
      band.addColorStop(0, 'rgba(255, 255, 255, 0)');
      band.addColorStop(0.5, `${color}55`);
      band.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = band;
      ctx.fillRect(boardX, y - fontSize * 0.7, boardWidth, fontSize * 1.4);
    }
    ctx.lineWidth = Math.max(2, fontSize * 0.16);
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.85)';
    ctx.shadowBlur = 0;
    ctx.strokeText(line.text, centerX, y, boardWidth - cell);
    ctx.shadowColor = color;
    ctx.shadowBlur = reduced ? 4 : 10 + line.tier * 4;
    ctx.fillStyle = color;
    ctx.fillText(line.text, centerX, y, boardWidth - cell);
    y += fontSize * 1.15;
  }
  ctx.restore();
}

/** 콤보 미터 — 홀드 아래. 콤보가 이어지는 동안 숫자·막대가 빛나고, 끊기면 옅어진다 */
export function drawComboMeter(
  ctx: CanvasRenderingContext2D,
  fx: EffectTracker | null,
  frame: number,
  centerX: number,
  top: number,
  cell: number,
  width: number,
  reduced: boolean,
  effect: EffectSkin = DEFAULT_EFFECT,
  board: BoardSkin = DEFAULT_BOARD,
): void {
  const meter = fx?.combo;
  if (!meter || meter.combo < 1) return;
  const age = frame - meter.frame;
  if (age < 0) return;
  const alpha = meter.ended ? Math.max(0, 1 - age / 30) : 1;
  if (alpha <= 0) return;
  const tier = Math.min(4, 1 + Math.floor(meter.combo / 3));
  const color = effect.tierColors[tier];
  const pulse = reduced || meter.ended ? 1 : 1 + 0.25 * Math.max(0, 1 - age / 8);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = board.label;
  ctx.font = `600 ${Math.max(9, Math.floor(cell * 0.42))}px system-ui, sans-serif`;
  ctx.fillText('COMBO', centerX, top);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = reduced ? 3 : 12;
  ctx.font = `800 ${Math.round(cell * 1.1 * pulse)}px system-ui, sans-serif`;
  ctx.fillText(String(meter.combo), centerX, top + cell * 1.25);
  // 막대 — 다음 단계까지 남은 정도
  const barWidth = Math.min(width, cell * 2.4);
  const fill = (meter.combo % 3) / 3 || 1;
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
  ctx.fillRect(centerX - barWidth / 2, top + cell * 1.55, barWidth, Math.max(2, cell * 0.14));
  ctx.fillStyle = color;
  ctx.fillRect(centerX - barWidth / 2, top + cell * 1.55, barWidth * fill, Math.max(2, cell * 0.14));
  ctx.restore();
}
