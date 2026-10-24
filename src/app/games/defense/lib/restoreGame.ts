import { MAX_TICKS, OP_ARG_COUNTS, type CommandRecorder, type GameState, type Stage, applyCommand, createGame, step } from '../engine';
import { LeakTracker } from './leakTracker';

/**
 * 이어하기 다시 돌리기 (defense DESIGN §F9b) — simulateReplay와 같은 규칙(명령 틱 = 그 틱까지 step한 뒤 적용). 저장소는 lib/resume
 * 명령 로그를 tick까지 다시 돌린 상태와, 이어서 기록할 recorder — 로그가 깨졌거나(무효 명령·끝난 판) tick 전에 끝나면 null
 * 증강 대기(무한·주간)도 simulateReplay처럼 — 대기 중에는 틱이 멈추고, 그동안의 명령(카드 선택)은 delta 0. 누수 집계도 이벤트로 다시 모은다(결과 화면 실패 원인이 처음부터의 것이 되게)
 * 손상된 저장본(정수가 아님·판 상한 넘는 틱)은 돌리기 전에 거른다 — 웨이브 없이 큰 tick이면 끝나지 않는 루프가 된다
 */
export type RestoredGame = { state: GameState; recorder: CommandRecorder; leaks: LeakTracker };

/** 이만큼 틱을 돌릴 때마다 쉰다 — 긴 판(최대 MAX_TICKS)을 한 번에 돌리면 메인 스레드가 수 초 멈춘다 (games-polish FE-06, replayRunner와 같은 크기) */
export const RESTORE_CHUNK_TICKS = 4000;

/** 다시 돌리기 본체 — RESTORE_CHUNK_TICKS 틱마다 진행률(0~1)을 내고 멈춘다. 끝나면 결과(손상이면 null) */
function* restoreSteps(stage: Stage, seed: number, inputs: readonly number[], tick: number): Generator<number, RestoredGame | null> {
  if (!Number.isInteger(seed) || seed < 0 || !Number.isInteger(tick) || tick < 0 || tick > MAX_TICKS || !inputs.every(Number.isInteger)) return null;
  const state = createGame(stage, seed);
  const leaks = new LeakTracker();
  const events: number[] = [];
  let ran = 0;
  let commandTick = 0;
  let i = 0;
  while (i < inputs.length) {
    commandTick += inputs[i];
    const op = inputs[i + 1];
    const count = OP_ARG_COUNTS[op];
    // 모르는 명령·음수 delta·인자가 잘린 끝·저장 틱 뒤 명령은 손상된 로그
    if (count === undefined || inputs[i] < 0 || i + 2 + count > inputs.length || commandTick > tick) return null;
    while (state.tick < commandTick && !state.over && !state.augmentPending) {
      events.length = 0;
      step(state, events);
      leaks.onEvents(events, state);
      if (++ran % RESTORE_CHUNK_TICKS === 0) yield state.tick / Math.max(1, tick);
    }
    // 증강 대기에 막혀 명령 틱까지 못 갔으면 손상된 로그(뒤 틱으로 미룬 명령은 수행 불가 — simulateReplay와 같다)
    if (state.over || state.tick !== commandTick) return null;
    const a = count > 0 ? inputs[i + 2] : 0;
    const b = count > 1 ? inputs[i + 3] : 0;
    if (!applyCommand(state, op, a, b)) return null;
    i += 2 + count;
  }
  while (state.tick < tick && !state.over && !state.augmentPending) {
    events.length = 0;
    step(state, events);
    leaks.onEvents(events, state);
    if (++ran % RESTORE_CHUNK_TICKS === 0) yield state.tick / Math.max(1, tick);
  }
  if (state.over || state.tick !== tick) return null;
  return { state, recorder: { inputs: inputs.slice(), lastTick: commandTick }, leaks };
}

export function restoreGame(stage: Stage, seed: number, inputs: readonly number[], tick: number): RestoredGame | null {
  const steps = restoreSteps(stage, seed, inputs, tick);
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * 같은 다시 돌리기를 틱 묶음마다 쉬면서 — 진행률을 알리고, 화면을 떠나면(isCancelled) 멈춰 "cancelled"
 * 결과는 restoreGame과 같다(같은 본체)
 */
export async function restoreGameInChunks(
  stage: Stage,
  seed: number,
  inputs: readonly number[],
  tick: number,
  { onProgress, isCancelled }: { onProgress?: (ratio: number) => void; isCancelled?: () => boolean } = {},
): Promise<RestoredGame | null | 'cancelled'> {
  const steps = restoreSteps(stage, seed, inputs, tick);
  let next = steps.next();
  while (!next.done) {
    onProgress?.(next.value);
    await pause();
    if (isCancelled?.()) return 'cancelled';
    next = steps.next();
  }
  return next.value;
}
