import { writeFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { ACTION, MAX_FRAMES, MAX_INPUT_LENGTH, type ReplayInput, simulateReplay, stepFrame } from '../engine';
import { type Candidate, pickBest } from './ai';
import { GameDriver, cloneGame } from './driver';

const ROTATIONS: number[][] = [[], [ACTION.ROTATE_CW], [ACTION.ROTATE_CW, ACTION.ROTATE_CW], [ACTION.ROTATE_CCW]];

/** 하드드롭 없이 자연 고정되는 배치 — 블록이 오래 살아 프레임을 최대로 쓴다 */
function naturalCandidates(driver: GameDriver): Candidate[] {
  const out: Candidate[] = [];
  const start = driver.state;
  const prefixes = start.holdUsed ? [[]] : [[], [ACTION.HOLD]];
  for (const prefix of prefixes) {
    for (const rotation of ROTATIONS) {
      for (let dx = -5; dx <= 5; dx++) {
        const actions = [...prefix, ...rotation];
        const press = dx < 0 ? ACTION.LEFT_PRESS : ACTION.RIGHT_PRESS;
        const release = dx < 0 ? ACTION.LEFT_RELEASE : ACTION.RIGHT_RELEASE;
        for (let i = 0; i < Math.abs(dx); i++) actions.push(press, release);
        const after = cloneGame(start);
        stepFrame(after, actions, actions.length);
        let frames = 1;
        while (!after.over && after.pieces === start.pieces && frames < 5000) {
          stepFrame(after, [], 0);
          frames++;
        }
        if (after.pieces !== start.pieces + 1) continue;
        out.push({ frames: [actions, ...new Array(frames - 1).fill([])], after });
      }
    }
  }
  return out;
}

/**
 * 최악 조건에 가까운 실제 판: 프레임 216,000 직전까지 살아남고 입력을 상한(40,000)까지 채운다
 * 남는 입력 예산은 효과 없는 '소프트드롭 뗌'으로 채운다(유효한 입력)
 */
function buildWorstCaseReplay(seed: number): ReplayInput {
  const d = new GameDriver(seed, 10, 2);
  const stopFrame = MAX_FRAMES - 4000;
  const codeBudget = MAX_INPUT_LENGTH / 2;
  while (!d.state.over && d.state.frame < stopFrame && d.recorder.inputs.length / 2 < codeBudget - 200) {
    d.idleUntilActive();
    if (d.state.over) break;
    const best = pickBest(naturalCandidates(d), {});
    if (!best) break;
    d.run(best.frames);
  }
  let remaining = codeBudget - d.recorder.inputs.length / 2;
  while (remaining > 0 && !d.state.over) {
    const n = Math.min(remaining, 1000);
    d.step(new Array(n).fill(ACTION.SOFT_DROP_RELEASE));
    remaining -= n;
  }
  d.idleUntilOver();
  return d.toReplayInput();
}

/**
 * 성능 실측 — DESIGN §4-4 목표: 최악(216,000프레임·입력 40,000) simulateReplay가 Node에서 200ms 이하
 * TETRIS_PERF=1 pnpm exec vitest run src/app/games/tetris/engine-dev/perf.test.ts
 * TETRIS_PERF_OUT=<경로>를 주면 측정한 리플레이를 JSON으로 저장한다(백엔드 실측용)
 */
describe.runIf(process.env.TETRIS_PERF === '1')('simulateReplay 성능', () => {
  it('최악 조건에 가까운 실제 판', () => {
    const input = buildWorstCaseReplay(2026);
    const result = simulateReplay(input);
    expect(result.ok).toBe(true);
    if (process.env.TETRIS_PERF_OUT) writeFileSync(process.env.TETRIS_PERF_OUT, JSON.stringify(input));

    const runs: number[] = [];
    for (let i = 0; i < 3; i++) simulateReplay(input); // 워밍업
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      simulateReplay(input);
      runs.push(performance.now() - t0);
    }
    runs.sort((a, b) => a - b);
    const summary = {
      frames: input.frames,
      inputLength: input.inputs.length,
      result,
      msMin: runs[0].toFixed(1),
      msMedian: runs[10].toFixed(1),
      msMax: runs[runs.length - 1].toFixed(1),
      node: process.version,
    };
    console.log(JSON.stringify(summary));
    expect(input.frames).toBeLessThanOrEqual(MAX_FRAMES);
    expect(input.inputs.length).toBeLessThanOrEqual(MAX_INPUT_LENGTH);
  }, 600_000);
});
