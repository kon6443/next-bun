/**
 * 개발 도구 — 엔진을 명령 기록과 함께 구동한다 (골든 생성·성능 측정·테스트용)
 * 엔진 폴더(백엔드 복사 대상)가 아니라서 부동소수·Math 등 제약이 없다
 */

import {
  type CommandRecorder,
  type GameState,
  type ReplayInput,
  type Stage,
  type Wave,
  applyCommand,
  createCommandRecorder,
  createGame,
  recordCommand,
  resolveBoard,
  step,
} from '../engine';

export class GameDriver {
  readonly state: GameState;
  readonly recorder: CommandRecorder = createCommandRecorder();
  /** 봇의 웨이브 미리보기 — 시뮬레이터 시험 판은 보드 웨이브를 잘라도 미리보기는 실제 판과 같게 둔다(없으면 보드 웨이브) */
  preview: readonly Wave[] | null = null;

  /** mode = 리플레이 헤더 mode(캠페인·무한·주간 — boardKey는 stage.id) · state를 넘기면 그 상태에서 이어 간다(스냅샷 복제) */
  constructor(
    readonly stage: Stage,
    readonly seed: number,
    readonly mode: string = 'campaign',
    state?: GameState,
  ) {
    this.state = state ?? createGame(stage, seed);
  }

  /** 헤더(mode·boardKey·seed)로 판을 만든다 — 무한·주간은 seed로 웨이브가 정해진다 */
  static fromBoard(mode: string, boardKey: string, seed: number): GameDriver {
    const stage = resolveBoard(mode, boardKey, seed);
    if (!stage) throw new Error(`보드를 해석할 수 없음: ${mode} ${boardKey}`);
    return new GameDriver(stage, seed, mode);
  }

  /** 상태·기록을 통째로 복제 — 시뮬레이터 스냅샷(같은 웨이브를 여러 조건으로 다시 돌린다) */
  clone(): GameDriver {
    const copy = new GameDriver(this.stage, this.seed, this.mode, structuredClone(this.state));
    copy.recorder.inputs = this.recorder.inputs.slice();
    copy.recorder.lastTick = this.recorder.lastTick;
    copy.preview = this.preview;
    return copy;
  }

  /** 틱 경계에서 명령 — 수락하면 기록하고 true (실시간 플레이 훅과 같은 원칙) */
  command(op: number, a = 0, b = 0): boolean {
    const accepted = applyCommand(this.state, op, a, b);
    if (accepted) recordCommand(this.recorder, this.state.tick, op, a, b);
    return accepted;
  }

  /** 수락되지 않으면 던진다 — 골든 케이스를 손으로 짤 때 실수를 바로 드러낸다 */
  must(op: number, a = 0, b = 0): void {
    if (!this.command(op, a, b)) throw new Error(`명령 거부: op ${op} (${a}, ${b}) @ tick ${this.state.tick}`);
  }

  run(ticks: number): void {
    for (let i = 0; i < ticks && !this.state.over; i++) step(this.state);
  }

  runUntil(done: (state: GameState) => boolean, maxTicks = 200000): void {
    for (let i = 0; i < maxTicks && !this.state.over && !done(this.state); i++) step(this.state);
  }

  /** 끝난 판의 리플레이 헤더+로그 (boardKey = 스테이지 id — 무한·주간은 보드 키 그대로) */
  toReplayInput(): ReplayInput {
    return { mode: this.mode, boardKey: this.stage.id, seed: this.seed, ticks: this.state.endTick, inputs: this.recorder.inputs.slice() };
  }
}
