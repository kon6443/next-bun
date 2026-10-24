import { BOARD_WIDTH } from '../../engine';
import { BOARD_BASE64_LENGTH, BOARD_BYTES, BOARD_CELL_MAX, BOARD_VISIBLE_ROW_OFFSET } from '@/types/tetrisBattleSocket';

/**
 * 판 인코딩 (DESIGN §16) — 엔진 판(40행)의 보이는 20행을 위→아래, 왼쪽→오른쪽 칸당 1바이트로 늘어놓고 base64
 * 칸 값 0 빈칸 · 1~7 블록 · 8 가비지. 브라우저 btoa/atob만 쓴다(Buffer 없음)
 */

/** 엔진 판(BOARD_ROWS × BOARD_WIDTH) → 보이는 200칸 */
function visibleCells(board: Uint8Array): Uint8Array {
  return board.slice(BOARD_VISIBLE_ROW_OFFSET * BOARD_WIDTH, BOARD_VISIBLE_ROW_OFFSET * BOARD_WIDTH + BOARD_BYTES);
}

export function encodeBoard(board: Uint8Array): string {
  const cells = visibleCells(board);
  let binary = '';
  for (let i = 0; i < cells.length; i++) binary += String.fromCharCode(cells[i]);
  return btoa(binary);
}

/** 보이는 200칸 — 형식이 틀리면 null (상대 화면 표시용이라 그리지 않고 넘어간다) */
export function decodeBoard(encoded: string): Uint8Array | null {
  if (typeof encoded !== 'string' || encoded.length !== BOARD_BASE64_LENGTH) return null;
  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    return null;
  }
  if (binary.length !== BOARD_BYTES) return null;
  const cells = new Uint8Array(BOARD_BYTES);
  for (let i = 0; i < BOARD_BYTES; i++) {
    const value = binary.charCodeAt(i);
    if (value > BOARD_CELL_MAX) return null;
    cells[i] = value;
  }
  return cells;
}
