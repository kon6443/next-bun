/**
 * 개발 도구 — 픽스처 생성·성능 측정용 간단한 배치 AI
 * 후보는 모두 실제 stepFrame으로 실행해 만든다 (엔진이 정한 결과만 쓴다)
 */

import {
  ACTION,
  BOARD_ROWS,
  BOARD_WIDTH,
  type GameState,
  type TSpinKind,
  collides,
  stepFrame,
} from '../engine';
import { cloneGame } from './driver';

export type Candidate = {
  /** 프레임별 입력 */
  frames: number[][];
  /** 실행 후 상태 (블록 고정 직후) */
  after: GameState;
};

function runFrames(state: GameState, frames: number[][]): void {
  for (const actions of frames) {
    if (state.over) return;
    stepFrame(state, actions, actions.length);
  }
}

const tap = (press: number, release: number, times: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i < times; i++) out.push(press, release);
  return out;
};

const ROTATIONS: number[][] = [[], [ACTION.ROTATE_CW], [ACTION.ROTATE_CW, ACTION.ROTATE_CW], [ACTION.ROTATE_CCW]];

/** 회전 → 좌우 탭 → 하드드롭을 한 프레임에 */
export function hardDropCandidates(state: GameState, options: { useHold?: boolean } = {}): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const prefix = options.useHold ? [ACTION.HOLD] : [];
  for (const rotation of ROTATIONS) {
    for (let dx = -6; dx <= 6; dx++) {
      const shift = dx < 0 ? tap(ACTION.LEFT_PRESS, ACTION.LEFT_RELEASE, -dx) : tap(ACTION.RIGHT_PRESS, ACTION.RIGHT_RELEASE, dx);
      const actions = [...prefix, ...rotation, ...shift, ACTION.HARD_DROP];
      const after = cloneGame(state);
      stepFrame(after, actions, actions.length);
      if (after.pieces !== state.pieces + 1) continue;
      const key = Array.from(after.board).join('');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ frames: [actions], after });
    }
  }
  return out;
}

/**
 * 회전으로 끝나는 배치(T-스핀 등)까지 찾는 BFS — 좌·우·회전·소프트드롭(바닥까지)을 프레임 단위로 실제 실행
 * 바닥에 닿은 각 위치에서 하드드롭(0칸)으로 고정해 본다
 */
export function spinCandidates(state: GameState, maxNodes = 3000): Candidate[] {
  type Node = { s: GameState; frames: number[][] };
  const key = (s: GameState) => `${s.x},${s.y},${s.rotation}`;
  const queue: Node[] = [{ s: cloneGame(state), frames: [] }];
  const seen = new Set<string>([key(state)]);
  const out: Candidate[] = [];
  const startPieces = state.pieces;

  const ops: ((s: GameState) => number[][] | null)[] = [
    () => [[ACTION.LEFT_PRESS, ACTION.LEFT_RELEASE]],
    () => [[ACTION.RIGHT_PRESS, ACTION.RIGHT_RELEASE]],
    () => [[ACTION.ROTATE_CW]],
    () => [[ACTION.ROTATE_CCW]],
    (s) => {
      if (collides(s.board, s.piece, s.rotation, s.x, s.y + 1)) return null;
      const probe = cloneGame(s);
      const frames: number[][] = [[ACTION.SOFT_DROP_PRESS]];
      stepFrame(probe, frames[0], 1);
      while (probe.active && !collides(probe.board, probe.piece, probe.rotation, probe.x, probe.y + 1) && frames.length < 200) {
        frames.push([]);
        stepFrame(probe, [], 0);
      }
      frames.push([ACTION.SOFT_DROP_RELEASE]);
      return frames;
    },
  ];

  for (let head = 0; head < queue.length && queue.length < maxNodes; head++) {
    const node = queue[head];
    if (collides(node.s.board, node.s.piece, node.s.rotation, node.s.x, node.s.y + 1) && node.frames.length > 0) {
      const after = cloneGame(node.s);
      stepFrame(after, [ACTION.HARD_DROP], 1);
      if (after.pieces === startPieces + 1) out.push({ frames: [...node.frames, [ACTION.HARD_DROP]], after });
    }
    for (const op of ops) {
      const frames = op(node.s);
      if (!frames) continue;
      const next = cloneGame(node.s);
      runFrames(next, frames);
      if (!next.active || next.pieces !== startPieces) continue;
      const k = key(next);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ s: next, frames: [...node.frames, ...frames] });
    }
  }
  return out;
}

// ==================== 평가 ====================

/** 지울 줄을 뺀 판의 열 높이·구멍 */
function analyze(state: GameState): { heights: number[]; holes: number; maxHeight: number } {
  const removed = new Set(state.clearingRows);
  const rows: number[] = [];
  for (let y = 0; y < BOARD_ROWS; y++) if (!removed.has(y)) rows.push(y);
  // 아래에서부터 다시 쌓은 좌표로 본다
  const height = rows.length;
  const heights: number[] = new Array(BOARD_WIDTH).fill(0);
  let holes = 0;
  for (let x = 0; x < BOARD_WIDTH; x++) {
    let seenBlock = false;
    for (let i = 0; i < height; i++) {
      const filled = state.board[rows[i] * BOARD_WIDTH + x] !== 0;
      if (filled && !seenBlock) {
        seenBlock = true;
        heights[x] = height - i;
      } else if (!filled && seenBlock) {
        holes++;
      }
    }
  }
  return { heights, holes, maxHeight: Math.max(...heights) };
}

export type EvalOptions = {
  /** 이 열은 비워 둔다 (테트리스용 우물) */
  wellColumn?: number;
  /** 1~3줄 삭제를 피한다 */
  avoidSmallClears?: boolean;
  /** 줄 삭제에 가산점 */
  clearBonus?: number;
};

export function evaluate(candidate: Candidate, options: EvalOptions = {}): number {
  const s = candidate.after;
  if (s.over) return -1e9;
  const { heights, holes, maxHeight } = analyze(s);
  const lines = s.lastLock?.lines ?? 0;
  let aggregate = 0;
  let bumpiness = 0;
  for (let x = 0; x < BOARD_WIDTH; x++) {
    if (x === options.wellColumn) continue;
    aggregate += heights[x];
    const next = x + 1 === options.wellColumn ? x + 2 : x + 1;
    if (next < BOARD_WIDTH) bumpiness += Math.abs(heights[x] - heights[next]);
  }
  let value = -0.51 * aggregate - 0.36 * holes * 3 - 0.18 * bumpiness + 0.76 * lines * (options.clearBonus ?? 1);
  if (options.wellColumn !== undefined && lines < 4) value -= heights[options.wellColumn] * 4;
  if (options.avoidSmallClears && lines > 0 && lines < 4) value -= 6 * lines;
  if (maxHeight > 14) value -= (maxHeight - 14) * 5;
  return value;
}

export function pickBest(candidates: Candidate[], options: EvalOptions = {}): Candidate | null {
  let best: Candidate | null = null;
  let bestValue = -Infinity;
  for (const c of candidates) {
    const v = evaluate(c, options);
    if (v > bestValue) {
      bestValue = v;
      best = c;
    }
  }
  return best;
}

export function tSpinOf(c: Candidate): TSpinKind {
  return c.after.lastLock?.tSpin ?? 'none';
}
