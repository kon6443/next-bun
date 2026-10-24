import { describe, it, expect } from 'vitest';
import golden from '../engine/__fixtures__/golden-replays.json';
import { createGame, stepFrame } from '../engine';
import { cloneGameState } from './gameSnapshot';
import { collectActions } from './replayTimeline';
import { CHUNK_FRAMES, type PreparedTetrisReplay, SNAPSHOT_INTERVAL, nearestSnapshot, prepareTetrisReplay } from './replayPrepare';

type Case = { name: string; input: { seed: number; das: number; arr: number; frames: number; inputs: number[] } };
const input = (name: string) => (golden as Case[]).find((c) => c.name === name)!.input;

async function prepared(name: string, comboMin?: number) {
  return (await prepareTetrisReplay(input(name), { comboMin })) as PreparedTetrisReplay;
}


describe('싱글 리플레이 사전 패스 (games-polish P4·FE-13)', () => {
  it('4줄·B2B — 4줄은 고정 순간마다, 두 번째부터 설명에 B2B (테트리스 2번 = back-to-back 골든)', async () => {
    const { highlights } = await prepared('back-to-back');
    expect(highlights.map((h) => [h.kind, h.detail])).toEqual([
      ['tetris', '4줄'],
      ['tetris', '4줄 B2B'],
    ]);
    expect((await prepared('line-clear-4')).highlights.map((h) => h.kind)).toEqual(['tetris']);
  });

  it('T-스핀은 줄을 지운 것만 — 줄 없는 T-스핀(골든 t-spin-mini: tSpins 1, 함께 지운 줄 0)은 점이 없다', async () => {
    const full = await prepared('t-spin-full');
    expect(full.highlights.filter((h) => h.kind === 'tspin')).toHaveLength(1);
    expect(full.highlights.find((h) => h.kind === 'tspin')!.detail).toMatch(/^\d줄/);
    const mini = await prepared('t-spin-mini');
    const tspins = mini.highlights.filter((h) => h.kind === 'tspin');
    expect(tspins).toEqual([]);
  });

  it('콤보는 기준에 이른 순간 연쇄당 한 점 — 설명은 연쇄 최대치, 기준 아래면 없다', async () => {
    // 골든 combo의 최대 콤보는 2 — 기준 4(기본)면 점이 없고, 기준 2면 연쇄마다 점 하나
    expect((await prepared('combo')).highlights.filter((h) => h.kind === 'combo')).toEqual([]);
    const low = (await prepared('combo', 2)).highlights.filter((h) => h.kind === 'combo');
    expect(low.length).toBeGreaterThan(0);
    expect(low.every((h) => h.detail === '2콤보')).toBe(true);
  });

  it('전 구간 스냅샷 — 10초마다, 스냅샷에서 이어 돌린 상태 = 처음부터 돌린 상태', async () => {
    const data = input('t-spin-full');
    const replay = await prepared('t-spin-full');
    const last = Math.floor(data.frames / SNAPSHOT_INTERVAL) * SNAPSHOT_INTERVAL;
    for (let f = 0; f <= last; f += SNAPSHOT_INTERVAL) expect(replay.snapshots.has(f)).toBe(true);
    const target = last - 37;
    const snap = nearestSnapshot(replay, target);
    expect(snap.state.frame).toBe(Math.floor(target / SNAPSHOT_INTERVAL) * SNAPSHOT_INTERVAL);
    const fromSnap = cloneGameState(snap.state);
    let cursor = snap.cursor;
    const buf: number[] = [];
    while (fromSnap.frame < target) {
      cursor = collectActions(replay.timeline, cursor, fromSnap.frame, buf);
      stepFrame(fromSnap, buf, buf.length);
    }
    const fromStart = createGame({ seed: data.seed, das: data.das, arr: data.arr });
    let c2 = 0;
    while (fromStart.frame < target) {
      c2 = collectActions(replay.timeline, c2, fromStart.frame, buf);
      stepFrame(fromStart, buf, buf.length);
    }
    expect(JSON.stringify(fromSnap)).toBe(JSON.stringify(fromStart));
  });

  it('1분 분량마다 쉬며 진행률을 내고, 멈추면 cancelled', async () => {
    const data = input('top-out-no-input'); // 6806프레임 — 1분(3600) 묶음 2개
    expect(data.frames).toBeGreaterThan(CHUNK_FRAMES);
    const progress: number[] = [];
    await prepareTetrisReplay(data, { onProgress: (r) => progress.push(r) });
    expect(progress.length).toBe(2);
    expect(progress[progress.length - 1]).toBe(1);
    expect(await prepareTetrisReplay(data, { isCancelled: () => true })).toBe('cancelled');
  });
});
