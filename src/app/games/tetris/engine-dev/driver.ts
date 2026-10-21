/**
 * 개발 도구 — 엔진을 입력 기록과 함께 구동한다 (골든 픽스처 생성·성능 측정용)
 * 엔진 폴더(백엔드 복사 대상)가 아니라서 부동소수·Math 등 제약이 없다
 */

import {
  type GameState,
  type InputRecorder,
  type ReplayInput,
  createGame,
  createInputRecorder,
  recordInput,
  stepFrame,
} from '../engine';
import { cloneGameState } from '../lib/gameSnapshot';

export const cloneGame = cloneGameState;

export class GameDriver {
  readonly state: GameState;
  readonly recorder: InputRecorder = createInputRecorder();

  constructor(readonly seed: number, readonly das: number, readonly arr: number) {
    this.state = createGame({ seed, das, arr });
  }

  /** 한 프레임 — 실제로 적용된 입력만 기록한다 */
  step(actions: number[] = []): void {
    const frame = this.state.frame;
    const applied = stepFrame(this.state, actions, actions.length);
    for (let i = 0; i < applied; i++) recordInput(this.recorder, frame, actions[i]);
  }

  /** 프레임별 입력 묶음을 차례로 */
  run(frames: number[][]): void {
    for (const actions of frames) {
      if (this.state.over) return;
      this.step(actions);
    }
  }

  /** 입력 없이 다음 블록이 나올 때까지 */
  idleUntilActive(maxFrames = 1000): void {
    for (let i = 0; i < maxFrames && !this.state.active && !this.state.over; i++) this.step();
  }

  /** 입력 없이 게임 오버까지 */
  idleUntilOver(maxFrames = 200000): void {
    for (let i = 0; i < maxFrames && !this.state.over; i++) this.step();
  }

  toReplayInput(): ReplayInput {
    return {
      seed: this.seed,
      das: this.das,
      arr: this.arr,
      frames: this.state.endFrame,
      inputs: this.recorder.inputs.slice(),
    };
  }
}
