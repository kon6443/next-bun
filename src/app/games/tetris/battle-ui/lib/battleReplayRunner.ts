import {
  type BattleReplayInput,
  type BattleState,
  type GarbageEvent,
  createBattle,
  pendingGarbageLines,
  receiveGarbage,
  stepBattle,
} from '../../battle-engine';
import { type Highlight, thinHighlights } from '@/app/games/_shared/lib/highlights';
import { FRAMES_PER_SECOND } from '../../engine';
import { cloneGameState } from '../../lib/gameSnapshot';
import type { GarbageGauge } from '../../lib/renderer';
import { type ReplayTimeline, buildTimeline, collectActions } from '../../lib/replayTimeline';

/**
 * 대전 리플레이 한 판 재생 (DESIGN §18) — 화면 없이 프레임 단위로 진행한다
 * 프레임 처리 순서는 simulateBattleReplay와 같다: 그 프레임에 도착한 가비지를 받는다 → 그 프레임 입력으로 stepBattle
 * 그래서 끝까지 진행한 결과가 서버가 검증한 기록과 같다(테스트로 고정)
 */

export type BattleReplayRunner = {
  replay: BattleReplayInput;
  timeline: ReplayTimeline;
  /** 도착 프레임을 절대값으로 푼 가비지 */
  garbage: GarbageEvent[];
  bs: BattleState;
  inputCursor: number;
  garbageCursor: number;
};

/** 뒤로 탐색용 — 이 프레임의 진행 상태 전체 */
export type BattleReplaySnapshot = {
  bs: BattleState;
  inputCursor: number;
  garbageCursor: number;
};

/** [deltaFrame, id, lines, hole, ...] → 절대 도착 프레임 */
export function decodeGarbageLog(log: readonly number[]): GarbageEvent[] {
  const out: GarbageEvent[] = [];
  let frame = 0;
  for (let i = 0; i + 3 < log.length; i += 4) {
    frame += log[i];
    out.push({ frame, id: log[i + 1], lines: log[i + 2], hole: log[i + 3] });
  }
  return out;
}

export function createReplayRunner(replay: BattleReplayInput): BattleReplayRunner {
  return {
    replay,
    timeline: buildTimeline(replay.inputs),
    garbage: decodeGarbageLog(replay.garbage),
    bs: createBattle({ seed: replay.seed, das: replay.das, arr: replay.arr }),
    inputCursor: 0,
    garbageCursor: 0,
  };
}

/** 기록한 프레임까지 다 진행했거나 판이 끝났으면 더 진행하지 않는다 */
export function isRunnerDone(runner: BattleReplayRunner): boolean {
  const game = runner.bs.game;
  return game.over || game.frame >= runner.replay.frames;
}

/**
 * 한 프레임 진행 — 진행했으면 true
 * @param buffer 프레임 입력을 담을 재사용 배열 (재생기는 판마다 하나씩 둔다)
 */
export function advanceRunner(runner: BattleReplayRunner, buffer: number[]): boolean {
  if (isRunnerDone(runner)) return false;
  const bs = runner.bs;
  const frame = bs.game.frame;
  while (runner.garbageCursor < runner.garbage.length && runner.garbage[runner.garbageCursor].frame === frame) {
    receiveGarbage(bs, runner.garbage[runner.garbageCursor]);
    runner.garbageCursor++;
  }
  runner.inputCursor = collectActions(runner.timeline, runner.inputCursor, frame, buffer);
  stepBattle(bs, buffer, buffer.length);
  return true;
}

function cloneBattleState(bs: BattleState): BattleState {
  return {
    ...bs,
    game: cloneGameState(bs.game),
    queue: bs.queue.map((item) => ({ ...item })),
    received: bs.received.slice(),
    sentLog: bs.sentLog.slice(),
  };
}

export function takeSnapshot(runner: BattleReplayRunner): BattleReplaySnapshot {
  return { bs: cloneBattleState(runner.bs), inputCursor: runner.inputCursor, garbageCursor: runner.garbageCursor };
}

/** 스냅샷(없으면 처음)으로 되돌린다 — 스냅샷은 그대로 두고 복사본을 쓴다 */
export function restoreRunner(runner: BattleReplayRunner, snapshot: BattleReplaySnapshot | null): void {
  if (snapshot) {
    runner.bs = cloneBattleState(snapshot.bs);
    runner.inputCursor = snapshot.inputCursor;
    runner.garbageCursor = snapshot.garbageCursor;
    return;
  }
  const { seed, das, arr } = runner.replay;
  runner.bs = createBattle({ seed, das, arr });
  runner.inputCursor = 0;
  runner.garbageCursor = 0;
}

/**
 * target 프레임까지 진행한다 — target이 지금보다 앞이면 target 이하에서 가장 가까운 스냅샷(없으면 처음)부터 다시
 * 진행하며 interval 배수 프레임마다 스냅샷을 남긴다 (싱글 재생기와 같은 방식)
 */
export function seekRunner(
  runner: BattleReplayRunner,
  snapshots: Map<number, BattleReplaySnapshot>,
  target: number,
  interval: number,
  buffer: number[],
): void {
  // 뒤로, 또는 스냅샷 한 칸보다 멀리 앞으로 — 사전 패스로 전 구간 스냅샷이 있으면 최대 interval만 다시 돈다 (games-polish FE-13)
  if (target < runner.bs.game.frame || target - runner.bs.game.frame > interval) {
    let base: BattleReplaySnapshot | null = null;
    for (const [frame, snapshot] of snapshots) {
      if (frame <= target && (!base || frame > base.bs.game.frame)) base = snapshot;
    }
    // 앞으로 갈 때 지금보다 앞선 스냅샷이 없으면 지금 자리에서 그대로 간다(되감지 않는다)
    if (target < runner.bs.game.frame || (base && base.bs.game.frame > runner.bs.game.frame)) restoreRunner(runner, base);
  }
  while (runner.bs.game.frame < target && advanceRunner(runner, buffer)) {
    const frame = runner.bs.game.frame;
    if (frame % interval === 0 && !snapshots.has(frame)) snapshots.set(frame, takeSnapshot(runner));
  }
}

/** 판 왼쪽 가비지 게이지 — 실시간 대전(useBattlePlay)과 같은 기준 */
export function garbageGaugeOf(bs: BattleState): GarbageGauge {
  let active = 0;
  for (const item of bs.queue) if (item.activeAt <= bs.game.frame) active += item.lines;
  return { pending: pendingGarbageLines(bs), active };
}

/** 가장 최근에 받은 가비지 — 판 위 "+N" 표시용 */
export function lastReceivedGarbage(bs: BattleState): GarbageEvent | null {
  return bs.received.length > 0 ? bs.received[bs.received.length - 1] : null;
}

/**
 * 대전 하이라이트 (games-polish P4) — 큰 공격(공격 줄 ≥ ATTACK_HIGHLIGHT_MIN — 4줄·T-스핀 더블 이상, 상쇄 전 공격)과 KO(판이 쌓여 끝난 순간)
 * 싱글·더블·트리플 공격(0~2줄)은 흔해 점이 레일을 뒤덮는다. 같은 판의 큰 공격이 1초 안에 몰리면 첫 것만
 */
export type BattleHighlightKind = 'attack' | 'ko';
export const ATTACK_HIGHLIGHT_MIN = 4;
const ATTACK_THIN_FRAMES = FRAMES_PER_SECOND;
/** 1분 분량마다 쉰다 — 판 4개를 받는 동안 화면이 멈추지 않게 */
const PREPARE_CHUNK_FRAMES = 60 * FRAMES_PER_SECOND;

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * 판 하나 사전 패스 — 따로 끝까지 돌려 interval마다 스냅샷을 snapshots에 채우고(어느 탐색이든 최대 interval만 다시 돈다, FE-13) 하이라이트를 모은다
 * 화면을 떠나면(isCancelled) 멈추고 null
 */
export async function prepareBattleTrack(
  replay: BattleReplayInput,
  snapshots: Map<number, BattleReplaySnapshot>,
  interval: number,
  isCancelled?: () => boolean,
): Promise<Highlight<BattleHighlightKind>[] | null> {
  const runner = createReplayRunner(replay);
  const buffer: number[] = [];
  snapshots.set(0, takeSnapshot(runner));
  while (!isRunnerDone(runner)) {
    const chunkEnd = runner.bs.game.frame + PREPARE_CHUNK_FRAMES;
    while (runner.bs.game.frame < chunkEnd && advanceRunner(runner, buffer)) {
      const frame = runner.bs.game.frame;
      if (frame % interval === 0 && !snapshots.has(frame)) snapshots.set(frame, takeSnapshot(runner));
    }
    if (isRunnerDone(runner)) break;
    await pause();
    if (isCancelled?.()) return null;
  }
  const marks: Highlight<BattleHighlightKind>[] = runner.bs.sentLog
    .filter((lock) => lock.attack >= ATTACK_HIGHLIGHT_MIN)
    .map((lock) => ({ at: lock.frame, kind: 'attack' as const, detail: `${lock.attack}줄 공격` }));
  const thinned = thinHighlights(marks, ATTACK_THIN_FRAMES);
  if (runner.bs.game.over) thinned.push({ at: runner.bs.game.endFrame, kind: 'ko' });
  return thinned;
}
