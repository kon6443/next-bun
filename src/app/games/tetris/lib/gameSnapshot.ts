import type { GameState } from '../engine';

/** 엔진 상태 깊은 복사 — 리플레이 탐색 스냅샷용 (엔진 폴더는 백엔드와 공유하므로 화면 쪽에 둔다) */
export function cloneGameState(s: GameState): GameState {
  return {
    ...s,
    board: s.board.slice(),
    queue: s.queue.slice(),
    clearingRows: s.clearingRows.slice(),
    pending: s.pending.slice(),
    lastLock: s.lastLock ? { ...s.lastLock, rows: s.lastLock.rows.slice() } : null,
  };
}
