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

/**
 * 테트리스 캔버스 렌더러 — 엔진 상태를 읽기만 한다(연출은 엔진 프레임 안에서만)
 * 레이아웃: [홀드] [판 10×20 + 위쪽 생성 줄 2] [다음 5개]
 */

/** 판 위에 보여 줄 숨은 줄 수 (생성 위치) */
const SPAWN_ROWS_SHOWN = 2;
const SIDE_COLUMNS = 3; // 옆 패널 폭 (판 칸 단위)
const MINI_SCALE = 0.6;

/** 가이드라인 색 — 칸 값(종류 + 1) 순서: I J L O S T Z */
const PIECE_COLORS = ['#22d3ee', '#3b82f6', '#f97316', '#facc15', '#22c55e', '#a855f7', '#ef4444'];

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

function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, alpha = 1): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
  // 위·왼쪽 밝은 테두리로 입체감
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x + 1, y + 1, size - 2, Math.max(1, size * 0.12));
  ctx.fillRect(x + 1, y + 1, Math.max(1, size * 0.12), size - 2);
  ctx.globalAlpha = 1;
}

/** 판 좌표(행) → 캔버스 y. 보이는 첫 줄(HIDDEN_ROWS)이 boardY */
const rowToY = (layout: BoardLayout, row: number) => layout.boardY + (row - HIDDEN_ROWS) * layout.cell;

function drawMiniPiece(ctx: CanvasRenderingContext2D, piece: number, cx: number, cy: number, size: number, alpha: number) {
  const cells = PIECE_CELLS[piece][0];
  let minX = 4, maxX = 0, minY = 4, maxY = 0;
  for (let i = 0; i < 8; i += 2) {
    minX = Math.min(minX, cells[i]);
    maxX = Math.max(maxX, cells[i]);
    minY = Math.min(minY, cells[i + 1]);
    maxY = Math.max(maxY, cells[i + 1]);
  }
  const offsetX = cx - ((maxX - minX + 1) * size) / 2;
  const offsetY = cy - ((maxY - minY + 1) * size) / 2;
  for (let i = 0; i < 8; i += 2) {
    drawCell(ctx, offsetX + (cells[i] - minX) * size, offsetY + (cells[i + 1] - minY) * size, size, PIECE_COLORS[piece], alpha);
  }
}

export type DrawOptions = {
  showGhost?: boolean;
};

export function drawGame(ctx: CanvasRenderingContext2D, state: GameState, layout: BoardLayout, options: DrawOptions = {}) {
  const { cell, boardX, boardY, sideWidth, width, height } = layout;
  const boardWidth = cell * BOARD_WIDTH;
  const boardHeight = cell * VISIBLE_ROWS;

  ctx.clearRect(0, 0, width, height);

  // 판 배경·격자
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fillRect(boardX, boardY, boardWidth, boardHeight);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
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
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.strokeRect(boardX - 0.5, boardY - 0.5, boardWidth + 1, boardHeight + 1);

  // 고정된 칸 (생성 줄 2개까지 보인다)
  const firstRow = HIDDEN_ROWS - SPAWN_ROWS_SHOWN;
  for (let row = firstRow; row < HIDDEN_ROWS + VISIBLE_ROWS; row++) {
    for (let col = 0; col < BOARD_WIDTH; col++) {
      const value = state.board[row * BOARD_WIDTH + col];
      if (value !== 0) drawCell(ctx, boardX + col * cell, rowToY(layout, row), cell, PIECE_COLORS[value - 1], row < HIDDEN_ROWS ? 0.6 : 1);
    }
  }

  // 줄 삭제 연출 — 지연 프레임 동안 흰빛이 사라진다
  if (state.clearingRows.length > 0 && !state.active) {
    const alpha = Math.max(0, Math.min(1, state.delay / LINE_CLEAR_DELAY_FRAMES));
    ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * alpha})`;
    for (const row of state.clearingRows) ctx.fillRect(boardX, rowToY(layout, row), boardWidth, cell);
  }

  if (state.active) {
    const cells = PIECE_CELLS[state.piece][state.rotation];
    const color = PIECE_COLORS[state.piece];
    if (options.showGhost !== false) {
      const ghostY = getDropY(state);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.55;
      for (let i = 0; i < 8; i += 2) {
        const row = ghostY + cells[i + 1];
        if (row < firstRow) continue;
        ctx.strokeRect(boardX + (state.x + cells[i]) * cell + 1.5, rowToY(layout, row) + 1.5, cell - 3, cell - 3);
      }
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < 8; i += 2) {
      const row = state.y + cells[i + 1];
      if (row < firstRow) continue;
      drawCell(ctx, boardX + (state.x + cells[i]) * cell, rowToY(layout, row), cell, color);
    }
  }

  // 홀드·다음
  const mini = Math.floor(cell * MINI_SCALE);
  ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
  ctx.font = `600 ${Math.max(10, Math.floor(cell * 0.5))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  const holdCenterX = boardX - cell / 2 - sideWidth / 2;
  const nextCenterX = boardX + boardWidth + cell / 2 + sideWidth / 2;
  ctx.fillText('HOLD', holdCenterX, boardY + cell * 0.6);
  ctx.fillText('NEXT', nextCenterX, boardY + cell * 0.6);
  if (state.hold !== -1) drawMiniPiece(ctx, state.hold, holdCenterX, boardY + cell * 2, mini, state.holdUsed ? 0.35 : 1);
  for (let i = 0; i < PREVIEW_COUNT && i < state.queue.length; i++) {
    drawMiniPiece(ctx, state.queue[i], nextCenterX, boardY + cell * 2 + i * mini * 3, mini, i === 0 ? 1 : 0.8);
  }
}
