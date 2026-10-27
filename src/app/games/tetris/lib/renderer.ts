import {
  BOARD_WIDTH,
  type GameState,
  HIDDEN_ROWS,
  LINE_CLEAR_DELAY_FRAMES,
  PIECE_CELLS,
  PREVIEW_COUNT,
  VISIBLE_ROWS,
  getDropY,
} from '../engine';
import { drawBlock, drawGlow } from './blockSprites';
import { type EffectTracker, isBigClear } from './effects';
import { NEON_ALPHA, NEON_LINE_WIDTH, drawNeonGhost } from './neonSprites';
import {
  type EffectQuality,
  boardBackground,
  drawBoardFrame,
  drawClearFlash,
  drawClearRing,
  drawComboMeter,
  drawEffectText,
  drawLevelGlow,
  drawParticles,
  drawRiseGlow,
  drawStarfield,
  drawTrail,
  levelNeon,
  riseOffset,
  shakeOffset,
} from './effectsRenderer';
import { drawBlockShine, drawBlockTwinkles, drawBoardLevelLayer, drawClearSparks, glowBoost, starDensity } from './levelLayers';
import { type BoardSkin, type BoardSkins, DEFAULT_BOARD_SKINS, blockSkin, boardSkin, effectSkin } from './skins';

/**
 * 테트리스 캔버스 렌더러 — 엔진 상태를 읽기만 한다(연출은 엔진 프레임 안에서만)
 * 레이아웃: [홀드] [판 10×20 + 위쪽 생성 줄 2] [다음 5개]
 * 칸 값 0 빈칸 · 1~7 블록 · 8 가비지(대전) — 색은 판 주인의 스킨 슬롯(skins.ts, DrawOptions.skins)
 * 스킨 레벨(DrawOptions.skins.levels)은 판 주인의 레벨 — 멈춘 강화는 늘, 움직이는 강화(levelLayers)는 발광을 그릴 때(full·연출 줄이기 아님·게임 중)만
 */

/** 판 위에 보여 줄 숨은 줄 수 (생성 위치) */
const SPAWN_ROWS_SHOWN = 2;
const SIDE_COLUMNS = 2.5; // 옆 패널 폭 (판 칸 단위) — 미니 블록(칸의 0.6) I 4칸 = 2.4칸이 들어가는 최소, 판을 키운다(D-004 S3)
const MINI_SCALE = 0.6;

export type BoardLayout = {
  cell: number;
  boardX: number;
  boardY: number;
  sideWidth: number;
  width: number;
  height: number;
};

export function computeLayout(width: number, height: number): BoardLayout {
  const columns = BOARD_WIDTH + SIDE_COLUMNS * 2 + 1;
  const rows = VISIBLE_ROWS + SPAWN_ROWS_SHOWN + 0.5;
  const cell = Math.max(8, Math.floor(Math.min(width / columns, height / rows)));
  const sideWidth = cell * SIDE_COLUMNS;
  const boardWidth = cell * BOARD_WIDTH;
  const totalWidth = boardWidth + sideWidth * 2 + cell;
  const boardX = Math.floor((width - totalWidth) / 2 + sideWidth + cell / 2);
  const boardY = Math.floor((height - cell * (VISIBLE_ROWS + SPAWN_ROWS_SHOWN)) / 2 + cell * SPAWN_ROWS_SHOWN);
  return { cell, boardX, boardY, sideWidth, width, height };
}

/** 판 좌표(행) → 캔버스 y. 보이는 첫 줄(HIDDEN_ROWS)이 boardY */
const rowToY = (layout: BoardLayout, row: number) => layout.boardY + (row - HIDDEN_ROWS) * layout.cell;

function drawMiniPiece(
  ctx: CanvasRenderingContext2D,
  piece: number,
  cx: number,
  cy: number,
  size: number,
  dpr: number,
  alpha: number,
  blockId: string,
  blockLevel: number,
) {
  const cells = PIECE_CELLS[piece][0];
  let minX = 4, maxX = 0, minY = 4, maxY = 0;
  for (let i = 0; i < 8; i += 2) {
    minX = Math.min(minX, cells[i]);
    maxX = Math.max(maxX, cells[i]);
    minY = Math.min(minY, cells[i + 1]);
    maxY = Math.max(maxY, cells[i + 1]);
  }
  const offsetX = Math.round(cx - ((maxX - minX + 1) * size) / 2);
  const offsetY = Math.round(cy - ((maxY - minY + 1) * size) / 2);
  for (let i = 0; i < 8; i += 2) {
    drawBlock(ctx, offsetX + (cells[i] - minX) * size, offsetY + (cells[i + 1] - minY) * size, size, piece + 1, dpr, alpha, blockId, blockLevel);
  }
}

export type DrawOptions = {
  showGhost?: boolean;
  /** 연출 기록 — 없으면 연출 없이 판만 그린다 */
  effects?: EffectTracker | null;
  /** 연출 줄이기 — 흔들림·파티클·잔상·확대를 끈다 */
  reduced?: boolean;
  /** 대전 가비지 게이지 — 판 왼쪽에 대기 줄(회색)과 곧 들어올 줄(빨강) */
  garbage?: GarbageGauge | null;
  /** lite = 저사양 감지 — 칸 발광을 끄고 별을 줄인다 (연출 줄이기도 lite로 그린다) */
  quality?: EffectQuality;
  /** 판 주인의 스킨(보드 슬롯 block·effect·board)과 레벨 — 없으면 기본 Lv1 */
  skins?: BoardSkins;
};

/** 칸 발광 세기 — 고정된 칸은 은은하게, 조작 중인 블록은 밝게 */
const GLOW_ALPHA_LOCKED = 0.22;
const GLOW_ALPHA_ACTIVE = 0.55;
/** 고스트 외곽선 발광 폭(shadowBlur) */
const GHOST_GLOW_BLUR = 8;

export type GarbageGauge = {
  /** 대기열 전체 줄 */
  pending: number;
  /** 그중 활성(다음 줄 없는 고정에 들어올) 줄 */
  active: number;
};

/** 판 왼쪽 틈(반 칸)에 세로 게이지 — 아래에서부터 활성(빨강) → 대기(회색), 판 높이를 넘으면 자른다 */
function drawGarbageGauge(ctx: CanvasRenderingContext2D, gauge: GarbageGauge, layout: BoardLayout, board: BoardSkin) {
  const { cell, boardX, boardY } = layout;
  const width = Math.max(3, Math.round(cell * 0.3));
  const x = boardX - Math.round(cell * 0.4) - Math.round(width / 2);
  const height = cell * VISIBLE_ROWS;
  const bottom = boardY + height;
  ctx.fillStyle = board.gauge.track;
  ctx.fillRect(x, boardY, width, height);
  const active = Math.min(gauge.active, VISIBLE_ROWS);
  const total = Math.min(gauge.pending, VISIBLE_ROWS);
  if (total > active) {
    ctx.fillStyle = board.gauge.pending;
    ctx.fillRect(x, bottom - total * cell, width, (total - active) * cell);
  }
  if (active > 0) {
    ctx.fillStyle = board.gauge.active;
    ctx.fillRect(x, bottom - active * cell, width, active * cell);
  }
}

/** 캔버스 변환에 걸린 DPR — 스프라이트를 실제 픽셀 크기로 만든다 */
function currentDpr(ctx: CanvasRenderingContext2D): number {
  const scale = typeof ctx.getTransform === 'function' ? ctx.getTransform().a : 1;
  return scale > 0 ? scale : 1;
}

export function drawGame(ctx: CanvasRenderingContext2D, state: GameState, layout: BoardLayout, options: DrawOptions = {}) {
  const { cell, boardX, boardY, sideWidth, width, height } = layout;
  const boardWidth = cell * BOARD_WIDTH;
  const boardHeight = cell * VISIBLE_ROWS;
  // 게임이 끝나면 엔진 프레임이 멈춰 연출 나이도 멈춘다 — 움직이는 연출(흔들림·파티클·잔상)은 그리지 않는다
  const effects = options.effects ?? null;
  const reduced = options.reduced ?? false;
  const still = reduced || state.over;
  const glow = !reduced && (options.quality ?? 'full') === 'full';
  const frame = state.frame;
  const dpr = currentDpr(ctx);
  const firstRow = HIDDEN_ROWS - SPAWN_ROWS_SHOWN;
  const skins = options.skins ?? DEFAULT_BOARD_SKINS;
  const skin = skins.block;
  const block = blockSkin(skins.block);
  const fxSkin = effectSkin(skins.effect);
  const board = boardSkin(skins.board);
  const levels = skins.levels ?? DEFAULT_BOARD_SKINS.levels;
  // 움직이는 레벨 강화 — 발광을 그리는 품질에서 게임 중일 때만
  const animate = glow && !still;

  ctx.clearRect(0, 0, width, height);
  // 배경 별 — 판 뒤 전체, 레벨 색조
  drawStarfield(ctx, frame, state.level, width, height, still, glow ? 'full' : 'lite', board, starDensity(levels.board));

  // 판은 흔들림만큼 옮겨 그린다 (옆 패널·문구는 고정)
  const [shakeX, shakeY] = shakeOffset(effects, frame, still);
  ctx.save();
  ctx.translate(shakeX, shakeY);

  // 판 배경(레벨별 색)·격자
  ctx.fillStyle = boardBackground(effects, state.level, frame, reduced, board);
  ctx.fillRect(boardX, boardY, boardWidth, boardHeight);
  ctx.strokeStyle = board.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < BOARD_WIDTH; x++) {
    ctx.moveTo(boardX + x * cell + 0.5, boardY);
    ctx.lineTo(boardX + x * cell + 0.5, boardY + boardHeight);
  }
  for (let y = 1; y < VISIBLE_ROWS; y++) {
    ctx.moveTo(boardX, boardY + y * cell + 0.5);
    ctx.lineTo(boardX + boardWidth, boardY + y * cell + 0.5);
  }
  ctx.stroke();
  // 매 프레임 그리는 테두리 — 저사양(lite)에서도 번짐을 줄인다
  drawBoardFrame(ctx, layout, boardWidth, boardHeight, state.level, !glow, board, levels.board);
  drawBoardLevelLayer(ctx, layout, boardWidth, boardHeight, levelNeon(state.level, board), levels.board, frame, animate);
  if (!still) drawLevelGlow(ctx, effects, frame, layout, boardWidth, boardHeight, board);

  // 가비지 상승 — 판 내용이 아래에서 밀려 올라온다(판 안으로 자른다)
  const rise = still ? 0 : riseOffset(effects, frame, cell, reduced);
  if (rise > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(boardX, boardY - cell * SPAWN_ROWS_SHOWN, boardWidth, boardHeight + cell * SPAWN_ROWS_SHOWN);
    ctx.clip();
    ctx.translate(0, rise);
  }

  // 칸 발광 — 블록보다 먼저 'lighter'로 깔아 네온처럼 번지게 (캐시 스프라이트 복사만)
  if (glow) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = GLOW_ALPHA_LOCKED * glowBoost(levels.block);
    for (let row = HIDDEN_ROWS; row < HIDDEN_ROWS + VISIBLE_ROWS; row++) {
      for (let col = 0; col < BOARD_WIDTH; col++) {
        const value = state.board[row * BOARD_WIDTH + col];
        if (value !== 0) drawGlow(ctx, boardX + col * cell, rowToY(layout, row), cell, value, dpr, skin);
      }
    }
    if (state.active) {
      const cells = PIECE_CELLS[state.piece][state.rotation];
      ctx.globalAlpha = Math.min(1, GLOW_ALPHA_ACTIVE * glowBoost(levels.block));
      for (let i = 0; i < 8; i += 2) {
        const row = state.y + cells[i + 1];
        if (row < firstRow) continue;
        drawGlow(ctx, boardX + (state.x + cells[i]) * cell, rowToY(layout, row), cell, state.piece + 1, dpr, skin);
      }
    }
    ctx.restore();
  }

  // 고정된 칸 (생성 줄 2개까지 보인다)
  for (let row = firstRow; row < HIDDEN_ROWS + VISIBLE_ROWS; row++) {
    for (let col = 0; col < BOARD_WIDTH; col++) {
      const value = state.board[row * BOARD_WIDTH + col];
      if (value !== 0) drawBlock(ctx, boardX + col * cell, rowToY(layout, row), cell, value, dpr, row < HIDDEN_ROWS ? 0.6 : 1, skin, levels.block);
    }
  }
  if (animate && levels.block >= 5) drawBlockTwinkles(ctx, state.board, layout, frame, block.highlight);

  // 줄 삭제 연출 — 지연 프레임 동안 흰빛이 사라진다
  if (state.clearingRows.length > 0 && !state.active) {
    const big = state.lastLock !== null && isBigClear(state.lastLock);
    drawClearFlash(ctx, state.clearingRows, state.delay / LINE_CLEAR_DELAY_FRAMES, big, layout, boardWidth, reduced, fxSkin, levels.effect, animate);
  }

  if (!still) drawTrail(ctx, effects, frame, layout, firstRow, block);

  if (state.active) {
    const cells = PIECE_CELLS[state.piece][state.rotation];
    const color = block.cells[state.piece + 1];
    if (options.showGhost !== false) {
      // 고스트 — 옅은 면 + 네온 외곽선
      const ghostY = getDropY(state);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = NEON_LINE_WIDTH;
      ctx.globalAlpha = 0.1;
      for (let i = 0; i < 8; i += 2) {
        const row = ghostY + cells[i + 1];
        if (row < firstRow) continue;
        ctx.fillRect(boardX + (state.x + cells[i]) * cell + 1, rowToY(layout, row) + 1, cell - 2, cell - 2);
      }
      // 발광 외곽선은 구워 둔 스프라이트로(neonSprites — 매 프레임 shadowBlur 없이). 발광이 꺼졌거나 생성 줄 위로 잘리는 칸이 있으면 직접
      let clipped = false;
      for (let i = 1; i < 8; i += 2) if (ghostY + cells[i] < firstRow) clipped = true;
      ctx.globalAlpha = 1;
      const sprite =
        glow &&
        !clipped &&
        drawNeonGhost(ctx, `${state.piece}|${state.rotation}`, cells, boardX + state.x * cell, rowToY(layout, ghostY), cell, color, GHOST_GLOW_BLUR);
      if (!sprite) {
        ctx.globalAlpha = NEON_ALPHA;
        ctx.shadowColor = color;
        ctx.shadowBlur = glow ? GHOST_GLOW_BLUR : 0;
        ctx.beginPath();
        for (let i = 0; i < 8; i += 2) {
          const row = ghostY + cells[i + 1];
          if (row < firstRow) continue;
          ctx.rect(boardX + (state.x + cells[i]) * cell + 1.5, rowToY(layout, row) + 1.5, cell - 3, cell - 3);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    for (let i = 0; i < 8; i += 2) {
      const row = state.y + cells[i + 1];
      if (row < firstRow) continue;
      drawBlock(ctx, boardX + (state.x + cells[i]) * cell, rowToY(layout, row), cell, state.piece + 1, dpr, 1, skin, levels.block);
    }
    if (animate && levels.block >= 4) drawBlockShine(ctx, cells, boardX + state.x * cell, rowToY(layout, state.y), firstRow - state.y, cell, frame, block.highlight);
  }

  if (rise > 0) ctx.restore();
  if (!still) drawRiseGlow(ctx, effects, frame, layout, boardWidth, boardHeight);
  if (!still) drawClearRing(ctx, effects, frame, layout, boardWidth, fxSkin, levels.effect);
  if (animate && levels.effect >= 5) drawClearSparks(ctx, effects, frame, layout, boardWidth, boardHeight, fxSkin);
  if (!still) drawParticles(ctx, effects, frame, layout, boardWidth, boardHeight, block);
  ctx.restore();

  if (options.garbage) drawGarbageGauge(ctx, options.garbage, layout, board);

  // 홀드·다음
  const mini = Math.floor(cell * MINI_SCALE);
  ctx.fillStyle = board.label;
  ctx.font = `600 ${Math.max(10, Math.floor(cell * 0.5))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const holdCenterX = boardX - cell / 2 - sideWidth / 2;
  const nextCenterX = boardX + boardWidth + cell / 2 + sideWidth / 2;
  ctx.fillText('HOLD', holdCenterX, boardY + cell * 0.6);
  ctx.fillText('NEXT', nextCenterX, boardY + cell * 0.6);
  if (state.hold !== -1) drawMiniPiece(ctx, state.hold, holdCenterX, boardY + cell * 2, mini, dpr, state.holdUsed ? 0.35 : 1, skin, levels.block);
  for (let i = 0; i < PREVIEW_COUNT && i < state.queue.length; i++) {
    drawMiniPiece(ctx, state.queue[i], nextCenterX, boardY + cell * 2 + i * mini * 3, mini, dpr, i === 0 ? 1 : 0.8, skin, levels.block);
  }
  // 콤보 미터 — 홀드 아래
  drawComboMeter(ctx, effects, frame, holdCenterX, boardY + cell * 4.6, cell, sideWidth, reduced, fxSkin, board);

  drawEffectText(ctx, effects, frame, layout, boardWidth, reduced, fxSkin, levels.effect);
}
