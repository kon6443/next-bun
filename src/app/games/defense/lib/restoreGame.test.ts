// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest';
import { MAX_TICKS, OP, TOWER_ID, applyCommand, createCommandRecorder, createGame, findStage, getStateHash, recordCommand, step } from '../engine';
import { GameDriver } from '../engine-dev/driver';
import { greedyBot } from '../engine-dev/sim/bots';
import { runGame } from '../engine-dev/sim/runner';
import { LeakTracker } from './leakTracker';
import { clearResume, loadResume, saveResume } from './resume';
import { RESTORE_CHUNK_TICKS, restoreGame, restoreGameInChunks } from './restoreGame';

const stage = findStage('s1')!;

/** 명령을 섞어 tick까지 진행한 판 */
function playTo(tick: number) {
  const state = createGame(stage, 9);
  const recorder = createCommandRecorder();
  const send = (op: number, a = 0, b = 0) => {
    if (applyCommand(state, op, a, b)) recordCommand(recorder, state.tick, op, a, b);
  };
  send(OP.BUILD, 7, TOWER_ID.CANNON);
  send(OP.BUILD, 5, TOWER_ID.ARCHER);
  send(OP.CALL_WAVE);
  while (state.tick < tick) {
    step(state);
    if (state.tick === 300) send(OP.UPGRADE, 7);
    if (state.tick === 450) send(OP.SET_TARGET, 5, 2);
  }
  return { state, recorder };
}

describe('이어하기 (lib/restoreGame · lib/resume)', () => {
  beforeEach(() => localStorage.clear());

  it('저장한 틱까지 다시 돌리면 같은 상태(해시) — 이어서 똑같이 진행해도 같다', () => {
    const live = playTo(600);
    const restored = restoreGame(stage, 9, live.recorder.inputs, 600)!;
    expect(getStateHash(restored.state)).toBe(getStateHash(live.state));
    expect(restored.recorder).toEqual({ inputs: live.recorder.inputs, lastTick: live.recorder.lastTick });
    for (let i = 0; i < 500; i++) {
      step(live.state);
      step(restored.state);
    }
    expect(getStateHash(restored.state)).toBe(getStateHash(live.state));
  });

  it('누수 집계도 다시 모은다 — 이어한 판의 실패 원인이 처음부터의 것', () => {
    // 타워 없이 웨이브만 부른 판 — 1웨이브부터 샌다
    const state = createGame(stage, 3);
    const recorder = createCommandRecorder();
    const leaks = new LeakTracker();
    const events: number[] = [];
    applyCommand(state, OP.CALL_WAVE);
    recordCommand(recorder, state.tick, OP.CALL_WAVE);
    while (state.tick < 1500) {
      events.length = 0;
      step(state, events);
      leaks.onEvents(events, state);
    }
    expect(leaks.byEnemy.reduce((a, b) => a + (b ?? 0), 0)).toBeGreaterThan(0);
    const restored = restoreGame(stage, 3, recorder.inputs, 1500)!;
    expect(restored.leaks.byEnemy).toEqual(leaks.byEnemy);
    expect(restored.leaks.worstWave()).toBe(leaks.worstWave());
  });

  it('손상된 저장본(정수 아님·판 상한 넘는 틱·음수 delta)은 돌리기 전에 null', () => {
    expect(restoreGame(stage, 9, [], MAX_TICKS + 1)).toBeNull();
    expect(restoreGame(stage, 9.5, [], 10)).toBeNull();
    expect(restoreGame(stage, 9, [0.5, 0], 10)).toBeNull();
    expect(restoreGame(stage, 9, [-1, 0], 10)).toBeNull();
    // 인자가 잘린 끝(BUILD는 인자 2개)
    expect(restoreGame(stage, 9, [0, OP.BUILD, 7], 10)).toBeNull();
  });

  it('깨진 로그·저장 틱 뒤 명령·끝난 판은 null', () => {
    const live = playTo(600);
    expect(restoreGame(stage, 9, live.recorder.inputs, 200)).toBeNull();
    expect(restoreGame(stage, 9, [0, 99], 10)).toBeNull();
    expect(restoreGame(stage, 9, [0, OP.SELL, 3], 10)).toBeNull();
  });

  it('저장소 — 1슬롯 왕복·지우기·깨진 저장본은 없음으로', () => {
    expect(loadResume()).toBeNull();
    saveResume({ engineVersion: 3, boardKey: 's1', seed: 9, tick: 600, inputs: [0, 0], savedAt: 1 });
    expect(loadResume()).toMatchObject({ v: 1, boardKey: 's1', tick: 600 });
    clearResume();
    expect(loadResume()).toBeNull();
    localStorage.setItem('defense:resume', JSON.stringify({ v: 1, boardKey: 's1', inputs: 'x', tick: 1 }));
    expect(loadResume()).toBeNull();
  });

  it('긴 판은 틱 묶음마다 쉬며 다시 돌린다 — 진행률을 내고 결과(해시)는 한 번에 돌린 것과 같다, 멈추면 cancelled (games-polish FE-06)', async () => {
    // 기준 봇으로 긴 무한 판(묶음 2개 넘게) — 봇이 증강도 고른다
    const near = GameDriver.fromBoard('endless', 'endless-s1', 9);
    runGame(near, greedyBot(), (d) => d.state.tick >= RESTORE_CHUNK_TICKS * 2 + 500 && !d.state.augmentPending);
    const tick = near.state.tick;
    expect(tick).toBeGreaterThan(RESTORE_CHUNK_TICKS * 2);
    const progress: number[] = [];
    const chunked = await restoreGameInChunks(near.stage, 9, near.recorder.inputs, tick, { onProgress: (r) => progress.push(r) });
    expect(chunked).not.toBeNull();
    expect(chunked).not.toBe('cancelled');
    const whole = restoreGame(near.stage, 9, near.recorder.inputs, tick)!;
    expect(getStateHash((chunked as typeof whole).state)).toBe(getStateHash(whole.state));
    expect(progress.length).toBe(Math.floor(tick / RESTORE_CHUNK_TICKS));
    expect(progress.every((r, i) => r > 0 && r <= 1 && (i === 0 || r > progress[i - 1]))).toBe(true);
    expect(await restoreGameInChunks(near.stage, 9, near.recorder.inputs, tick, { isCancelled: () => true })).toBe('cancelled');
  });
});
