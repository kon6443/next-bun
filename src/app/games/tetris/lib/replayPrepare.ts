import { type Highlight, thinHighlights } from '@/app/games/_shared/lib/highlights';
import { isPerfectClear } from './boardRules';
import { FRAMES_PER_SECOND, type GameState, createGame, stepFrame } from '../engine';
import { cloneGameState } from './gameSnapshot';
import { buildTimeline, collectActions, type ReplayTimeline } from './replayTimeline';

/**
 * 싱글 리플레이 사전 패스 (games-polish P4) — 재생 전에 기록을 한 번 끝까지 돌려
 * ① 전 구간 스냅샷(SNAPSHOT_INTERVAL마다) — 어느 방향 탐색이든 가까운 스냅샷에서 최대 10초만 다시 돌린다(FE-13: 앞으로 크게 끌면 동기로 수만 프레임)
 * ② 하이라이트 — 고정(lock)마다 의미 있는 순간을 고른다
 * 긴 판(최대 60분 = 216,000프레임)도 화면이 멈추지 않게 CHUNK_FRAMES마다 쉬며 진행률을 낸다. 엔진은 그대로(엔진 파일 무변경)
 */

export const SNAPSHOT_INTERVAL = 10 * FRAMES_PER_SECOND;
/** 1분 분량마다 쉰다 */
export const CHUNK_FRAMES = 60 * FRAMES_PER_SECOND;

/**
 * 하이라이트 기준 — 한 고정에 하나(우선순위 pc > tspin > tetris), 콤보는 따로
 * - tetris: 4줄 · tspin: T-스핀(미니 포함)으로 줄을 지운 고정 · pc: 퍼펙트 클리어 — 드물고 의도한 기술이라 전부
 * - B2B는 4줄·T-스핀에서만 생겨 점이 늘 겹친다 — 따로 찍지 않고 설명에 "B2B"를 붙인다
 * - combo: 연속 삭제가 COMBO_HIGHLIGHT_MIN(엔진 콤보 값, 0 = 첫 삭제)에 이른 순간 한 번 — 연쇄가 이어지면 그 점의 설명만 최대치로 고친다
 *   4 = 5연속 삭제. 보통 플레이의 1~2콤보는 흔해 점이 레일을 뒤덮는다
 */
export type TetrisHighlightKind = 'pc' | 'tspin' | 'tetris' | 'combo';
export const COMBO_HIGHLIGHT_MIN = 4;
/** 같은 종류가 이보다 가까우면 첫 것만(빠른 손의 연속 4줄 등) */
export const HIGHLIGHT_THIN_FRAMES = FRAMES_PER_SECOND;

export type TetrisSnapshot = { state: GameState; cursor: number };

export type PreparedTetrisReplay = {
  timeline: ReplayTimeline;
  /** 프레임 → 그 프레임 시작 상태(0 포함) */
  snapshots: Map<number, TetrisSnapshot>;
  highlights: Highlight<TetrisHighlightKind>[];
};

type Header = { seed: number; das: number; arr: number; frames: number; inputs: readonly number[] };

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function prepareTetrisReplay(
  data: Header,
  { onProgress, isCancelled, comboMin = COMBO_HIGHLIGHT_MIN }: { onProgress?: (ratio: number) => void; isCancelled?: () => boolean; comboMin?: number } = {},
): Promise<PreparedTetrisReplay | 'cancelled'> {
  const timeline = buildTimeline(data.inputs);
  const state = createGame({ seed: data.seed, das: data.das, arr: data.arr });
  const snapshots = new Map<number, TetrisSnapshot>([[0, { state: cloneGameState(state), cursor: 0 }]]);
  const marks: Highlight<TetrisHighlightKind>[] = [];
  const buffer: number[] = [];
  let cursor = 0;
  let pieces = state.pieces;
  /** 지금 이어지는 콤보 연쇄의 점 — 연쇄가 끊기면 null */
  let comboMark: Highlight<TetrisHighlightKind> | null = null;
  while (!state.over && state.frame < data.frames) {
    const chunkEnd = Math.min(data.frames, state.frame + CHUNK_FRAMES);
    while (!state.over && state.frame < chunkEnd) {
      cursor = collectActions(timeline, cursor, state.frame, buffer);
      stepFrame(state, buffer, buffer.length);
      const lock = state.lastLock;
      if (state.pieces !== pieces && lock) {
        pieces = state.pieces;
        const b2b = lock.backToBack ? ' B2B' : '';
        if (lock.lines > 0 && isPerfectClear(state.board, lock.rows)) marks.push({ at: lock.frame, kind: 'pc', detail: `${lock.lines}줄${b2b}` });
        else if (lock.lines > 0 && lock.tSpin !== 'none') marks.push({ at: lock.frame, kind: 'tspin', detail: `${lock.tSpin === 'mini' ? '미니 ' : ''}${lock.lines}줄${b2b}` });
        else if (lock.lines === 4) marks.push({ at: lock.frame, kind: 'tetris', detail: `4줄${b2b}` });
        if (lock.lines === 0) comboMark = null;
        else if (lock.combo >= comboMin) {
          if (!comboMark) {
            comboMark = { at: lock.frame, kind: 'combo' };
            marks.push(comboMark);
          }
          comboMark.detail = `${lock.combo}콤보`;
        }
      }
      if (state.frame % SNAPSHOT_INTERVAL === 0 && !snapshots.has(state.frame)) snapshots.set(state.frame, { state: cloneGameState(state), cursor });
    }
    onProgress?.(Math.min(1, state.frame / Math.max(1, data.frames)));
    if (state.over || state.frame >= data.frames) break;
    await pause();
    if (isCancelled?.()) return 'cancelled';
  }
  return { timeline, snapshots, highlights: thinHighlights(marks, HIGHLIGHT_THIN_FRAMES) };
}

/** target 이하 가장 가까운 스냅샷 — 사전 패스로 전 구간에 있으니 최대 SNAPSHOT_INTERVAL 프레임만 다시 돌린다 */
export function nearestSnapshot(prepared: PreparedTetrisReplay, target: number): TetrisSnapshot {
  const frame = Math.max(0, Math.floor(target / SNAPSHOT_INTERVAL) * SNAPSHOT_INTERVAL);
  for (let f = frame; f >= 0; f -= SNAPSHOT_INTERVAL) {
    const snapshot = prepared.snapshots.get(f);
    if (snapshot) return snapshot;
  }
  return prepared.snapshots.get(0)!;
}
