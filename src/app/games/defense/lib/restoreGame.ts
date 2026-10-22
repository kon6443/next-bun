import { MAX_TICKS, OP_ARG_COUNTS, type CommandRecorder, type GameState, type Stage, applyCommand, createGame, step } from '../engine';
import { LeakTracker } from './leakTracker';

/**
 * 이어하기 다시 돌리기 (defense DESIGN §F9b) — simulateReplay와 같은 규칙(명령 틱 = 그 틱까지 step한 뒤 적용). 저장소는 lib/resume
 * 명령 로그를 tick까지 다시 돌린 상태와, 이어서 기록할 recorder — 로그가 깨졌거나(무효 명령·끝난 판) tick 전에 끝나면 null
 * 캠페인 전용(증강 대기 없음). 누수 집계도 이벤트로 다시 모은다(결과 화면 실패 원인이 처음부터의 것이 되게)
 * 손상된 저장본(정수가 아님·판 상한 넘는 틱)은 돌리기 전에 거른다 — 웨이브 없이 큰 tick이면 끝나지 않는 루프가 된다
 */
export type RestoredGame = { state: GameState; recorder: CommandRecorder; leaks: LeakTracker };

export function restoreGame(stage: Stage, seed: number, inputs: readonly number[], tick: number): RestoredGame | null {
  if (!Number.isInteger(seed) || seed < 0 || !Number.isInteger(tick) || tick < 0 || tick > MAX_TICKS || !inputs.every(Number.isInteger)) return null;
  const state = createGame(stage, seed);
  const leaks = new LeakTracker();
  const events: number[] = [];
  const advance = () => {
    events.length = 0;
    step(state, events);
    leaks.onEvents(events, state);
  };
  let commandTick = 0;
  let i = 0;
  while (i < inputs.length) {
    commandTick += inputs[i];
    const op = inputs[i + 1];
    const count = OP_ARG_COUNTS[op];
    // 모르는 명령·음수 delta·인자가 잘린 끝·저장 틱 뒤 명령은 손상된 로그
    if (count === undefined || inputs[i] < 0 || i + 2 + count > inputs.length || commandTick > tick) return null;
    while (state.tick < commandTick && !state.over) advance();
    if (state.over || state.tick !== commandTick) return null;
    const a = count > 0 ? inputs[i + 2] : 0;
    const b = count > 1 ? inputs[i + 3] : 0;
    if (!applyCommand(state, op, a, b)) return null;
    i += 2 + count;
  }
  while (state.tick < tick && !state.over) advance();
  if (state.over) return null;
  return { state, recorder: { inputs: inputs.slice(), lastTick: commandTick }, leaks };
}
