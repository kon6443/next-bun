import { describe, it, expect } from 'vitest';
import golden from '../engine/__fixtures__/golden-replays.json';
import { createGame, getBoardHash, stepFrame } from '../engine';
import { cloneGameState } from './gameSnapshot';
import { buildTimeline, collectActions } from './replayTimeline';

describe('리플레이 탐색 스냅샷', () => {
  it('중간 스냅샷에서 이어 재생해도 처음부터 재생한 결과와 같다', () => {
    const c = golden.find((g) => g.name === 'combo')!;
    const { seed, das, arr, frames, inputs } = c.input;
    const timeline = buildTimeline(inputs);
    const buffer: number[] = [];

    const run = (state: ReturnType<typeof createGame>, cursor: number, until: number) => {
      while (state.frame < until && !state.over) {
        cursor = collectActions(timeline, cursor, state.frame, buffer);
        stepFrame(state, buffer, buffer.length);
      }
      return cursor;
    };

    const full = createGame({ seed, das, arr });
    run(full, 0, frames);

    const partial = createGame({ seed, das, arr });
    const cursor = run(partial, 0, Math.floor(frames / 2));
    const snapshot = cloneGameState(partial);
    run(partial, cursor, frames); // 원본을 더 진행해도 스냅샷은 그대로여야 한다
    const resumed = cloneGameState(snapshot);
    run(resumed, cursor, frames);

    expect(resumed.score).toBe(full.score);
    expect(resumed.endFrame).toBe(full.endFrame);
    expect(getBoardHash(resumed)).toBe(getBoardHash(full));
    expect(snapshot.frame).toBe(Math.floor(frames / 2));
  });
});
