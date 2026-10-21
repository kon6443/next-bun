/**
 * 개발 도구 — 엔진을 명령 기록과 함께 구동한다 (골든 생성·성능 측정·테스트용)
 * 엔진 폴더(백엔드 복사 대상)가 아니라서 부동소수·Math 등 제약이 없다
 */

import {
  type CommandRecorder,
  type GameState,
  type ReplayInput,
  type Stage,
  applyCommand,
  createCommandRecorder,
  createGame,
  recordCommand,
  step,
} from '../engine';

export class GameDriver {
  readonly state: GameState;
  readonly recorder: CommandRecorder = createCommandRecorder();

  constructor(readonly stage: Stage, readonly seed: number) {
    this.state = createGame(stage, seed);
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

  /** 끝난 판의 리플레이 헤더+로그 (캠페인: boardKey = 스테이지 id) */
  toReplayInput(): ReplayInput {
    return { mode: 'campaign', boardKey: this.stage.id, seed: this.seed, ticks: this.state.endTick, inputs: this.recorder.inputs.slice() };
  }
}
