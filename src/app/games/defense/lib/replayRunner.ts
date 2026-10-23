import type { GameState, Stage } from '../engine';
import type { ReplayEngine } from '../engine-versions';

/**
 * 리플레이 재생 엔진 쪽 (defense DESIGN §F7·§F10 재생기) — 화면 없이 돌리는 순수 로직, 엔진은 기록 버전으로 주입(engine-versions)
 * - 사전 패스(prepareReplay): 끝까지 한 번 돌려 웨이브 경계·명령 목록·스냅샷(웨이브 시작 + 30초 간격, 최대 120 — 넘으면 솎는다)을 모은다.
 *   긴 판(최대 90분)은 틱 묶음마다 쉬어 화면이 멈추지 않게(진행률 콜백)
 * - 커서(ReplayCursor): 상태 + 다음 명령 위치. advance로 앞으로, seek로 가까운 스냅샷에서 다시
 * - 명령 적용은 simulateReplay와 같은 규칙: 명령 틱까지 step한 뒤 적용, 증강 대기 중 명령은 delta 0, 선언 틱(ticks)을 넘어 돌리지 않는다
 */

export type ReplayHeader = { mode: string; boardKey: string; seed: number; ticks: number; inputs: readonly number[] };

/** 명령 하나 — 슬롯 강조·타임라인 점 (slot = 슬롯 대상 명령이면 그 슬롯, 아니면 -1) */
export type ReplayCommand = { tick: number; op: number; a: number; b: number; slot: number };

type Snapshot = { tick: number; state: GameState; index: number; nextTick: number };

export type ReplayCursor = { state: GameState; index: number; nextTick: number };

export type PreparedReplay = {
  engine: ReplayEngine;
  stage: Stage;
  seed: number;
  inputs: readonly number[];
  /** 재생 길이 (틱) — 기록의 끝난 틱 */
  totalTicks: number;
  /** 웨이브가 시작된 틱 (웨이브 순) — 진행 막대 눈금 */
  waveTicks: number[];
  commands: ReplayCommand[];
  snapshots: Snapshot[];
};

export type PrepareError = 'BOARD' | 'INVALID' | 'CANCELLED';

const SNAPSHOT_EVERY_SECONDS = 30;
const MAX_SNAPSHOTS = 120;
const CHUNK_TICKS = 4000;

/**
 * 상태 복제 — 보드(맵·웨이브 정의, 무한·주간은 생성된 80웨이브)는 엔진이 쓰지 않는 읽기 전용이라 복제하지 않고 같은 것을 붙인다
 * (스냅샷 최대 120개·탐색마다 복제 — 보드까지 복제하면 메모리·시간이 커진다)
 */
function cloneState(state: GameState): GameState {
  const { board, ...rest } = state;
  return { ...structuredClone(rest), board } as GameState;
}

/** 슬롯을 대상으로 하는 명령 (BUILD·UPGRADE·BRANCH·SELL·SET_TARGET — 첫 인자가 슬롯) */
function slotOf(engine: ReplayEngine, op: number, a: number): number {
  const { OP } = engine;
  return op === OP.BUILD || op === OP.UPGRADE || op === OP.BRANCH || op === OP.SELL || op === OP.SET_TARGET ? a : -1;
}

function startCursor(engine: ReplayEngine, stage: Stage, seed: number, inputs: readonly number[]): ReplayCursor {
  return { state: engine.createGame(stage, seed), index: 0, nextTick: inputs.length > 0 ? inputs[0] : 0 };
}

/**
 * target 틱까지 진행 — 이 틱의 명령을 모두 적용하고 다음 틱으로. 명령이 거부되면 false(손상된 기록)
 * onStep: 한 틱 돌 때마다(렌더 이벤트) · onCommand: 명령을 적용할 때마다
 */
export function advanceCursor(
  engine: ReplayEngine,
  cursor: ReplayCursor,
  inputs: readonly number[],
  target: number,
  events: number[] | null,
  onStep?: (events: readonly number[] | null) => void,
  onCommand?: (command: ReplayCommand) => void,
): boolean {
  const state = cursor.state;
  for (;;) {
    while (cursor.index < inputs.length && cursor.nextTick === state.tick) {
      const op = inputs[cursor.index + 1];
      const count = engine.OP_ARG_COUNTS[op] ?? 0;
      const a = count > 0 ? inputs[cursor.index + 2] : 0;
      const b = count > 1 ? inputs[cursor.index + 3] : 0;
      if (!engine.applyCommand(state, op, a, b)) return false;
      onCommand?.({ tick: state.tick, op, a, b, slot: slotOf(engine, op, a) });
      cursor.index += 2 + count;
      if (cursor.index < inputs.length) cursor.nextTick += inputs[cursor.index];
    }
    if (state.over || state.tick >= target || state.augmentPending) return true;
    if (events) events.length = 0;
    engine.step(state, events);
    onStep?.(events);
  }
}

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * 사전 패스 — 판을 해석할 수 없거나(보드) 기록이 깨졌으면(명령 거부·선언 틱에 안 끝남) 오류
 * isCancelled: 틱 묶음마다 확인 — 화면을 떠나면 긴 판의 사전 패스를 멈춘다
 */
export async function prepareReplay(
  engine: ReplayEngine,
  header: ReplayHeader,
  onProgress?: (ratio: number) => void,
  isCancelled?: () => boolean,
): Promise<PreparedReplay | PrepareError> {
  const stage = engine.resolveBoard(header.mode, header.boardKey, header.seed);
  if (!stage) return 'BOARD';
  const cursor = startCursor(engine, stage, header.seed, header.inputs);
  const waveTicks: number[] = [];
  const commands: ReplayCommand[] = [];
  let snapshots: Snapshot[] = [];
  let lastSnapshotTick = -Infinity;
  let snapshotEvery = SNAPSHOT_EVERY_SECONDS * engine.TICKS_PER_SECOND;
  const take = () => {
    snapshots.push({ tick: cursor.state.tick, state: cloneState(cursor.state), index: cursor.index, nextTick: cursor.nextTick });
    lastSnapshotTick = cursor.state.tick;
    // 넘치면 처음 것만 남기고 하나 걸러 솎고, 이후 간격도 두 배로 — 앞부분만 거듭 성겨지지 않게 고르게
    if (snapshots.length > MAX_SNAPSHOTS) {
      snapshots = [snapshots[0], ...snapshots.slice(1).filter((_, i) => i % 2 === 1)];
      snapshotEvery *= 2;
    }
  };
  take();
  const events: number[] = [];
  const { EVENT, EVENT_STRIDE } = engine;
  while (!cursor.state.over && cursor.state.tick < header.ticks) {
    const chunkEnd = Math.min(header.ticks, cursor.state.tick + CHUNK_TICKS);
    while (!cursor.state.over && cursor.state.tick < chunkEnd) {
      const target = Math.min(chunkEnd, cursor.state.tick + 1);
      const before = cursor.state.tick;
      let waveStarted = false;
      const ok = advanceCursor(
        engine,
        cursor,
        header.inputs,
        target,
        events,
        (ev) => {
          for (let i = 0; ev && i < ev.length; i += EVENT_STRIDE) if (ev[i] === EVENT.WAVE_START) waveStarted = true;
        },
        (command) => {
          commands.push(command);
          if (command.op === engine.OP.CALL_WAVE) waveStarted = true;
        },
      );
      if (!ok) return 'INVALID';
      // 증강 대기에 막혀 틱이 안 가면(고르지 않은 기록) 끝까지 못 간다
      if (cursor.state.tick === before && !cursor.state.over) return 'INVALID';
      if (waveStarted) waveTicks.push(cursor.state.tick);
      if (waveStarted || cursor.state.tick - lastSnapshotTick >= snapshotEvery) take();
    }
    onProgress?.(Math.min(1, cursor.state.tick / header.ticks));
    if (!cursor.state.over) await pause();
    if (isCancelled?.()) return 'CANCELLED';
  }
  // 끝난 뒤 남은 명령·선언 틱과 다른 끝 = 깨진 기록(simulateReplay NOT_ENDED·INPUT_AFTER_END)
  if (!cursor.state.over || cursor.state.endTick !== header.ticks || cursor.index < header.inputs.length) return 'INVALID';
  return { engine, stage, seed: header.seed, inputs: header.inputs, totalTicks: header.ticks, waveTicks: dedupe(waveTicks), commands, snapshots };
}

function dedupe(ticks: number[]): number[] {
  return ticks.filter((tick, i) => i === 0 || tick !== ticks[i - 1]);
}

/** target 틱 커서 — target 이하 마지막 스냅샷을 복제해 거기서 다시 돌린다 */
export function seekCursor(replay: PreparedReplay, target: number): ReplayCursor {
  const clamped = Math.max(0, Math.min(replay.totalTicks, Math.floor(target)));
  let snap = replay.snapshots[0];
  for (const s of replay.snapshots) if (s.tick <= clamped) snap = s;
  const cursor: ReplayCursor = { state: cloneState(snap.state), index: snap.index, nextTick: snap.nextTick };
  advanceCursor(replay.engine, cursor, replay.inputs, clamped, null);
  return cursor;
}

export function initialCursor(replay: PreparedReplay): ReplayCursor {
  return seekCursor(replay, 0);
}
