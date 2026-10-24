import { beforeAll, describe, it, expect } from 'vitest';
import * as engine from '../engine';
import { GameDriver } from '../engine-dev/driver';
import { greedyBot } from '../engine-dev/sim/bots';
import { runGame } from '../engine-dev/sim/runner';
import { canReplayVersion, loadReplayEngine } from '../engine-versions';
import { LEAK_MERGE_SECONDS, type PreparedReplay, advanceCursor, initialCursor, prepareReplay, seekCursor } from './replayRunner';

function botGame(mode: string, boardKey: string, seed: number) {
  const driver = GameDriver.fromBoard(mode, boardKey, seed);
  runGame(driver, greedyBot());
  return { driver, header: driver.toReplayInput() };
}

/** 봇 무한 판(증강 포함)은 한 판에 수 초 — 파일에서 한 번만 만든다(병렬 실행·부하에서 기본 5초 제한을 넘지 않게) */
let endless: ReturnType<typeof botGame>;
beforeAll(() => {
  endless = botGame('endless', 'endless-s1', 4);
}, 60_000);

describe('replayRunner — 사전 패스·커서·탐색', { timeout: 30_000 }, () => {
  it('무한 판(증강 포함): 끝까지 돌린 커서 = 실제 판(해시), 웨이브 경계 = 시작한 웨이브 수, 명령 목록 = 로그', async () => {
    const { driver, header } = endless;
    expect(driver.state.augments.length).toBeGreaterThan(0);
    let progress = 0;
    const replay = (await prepareReplay(engine, header, (r) => (progress = r))) as PreparedReplay;
    expect(typeof replay).toBe('object');
    expect(progress).toBe(1);
    expect(replay.totalTicks).toBe(driver.state.endTick);
    expect(replay.waveTicks).toHaveLength(driver.state.wavesStarted);
    expect(replay.waveTicks).toEqual([...replay.waveTicks].sort((a, b) => a - b));
    // 명령 수 = 로그의 명령 수, 슬롯 명령은 슬롯을 싣는다
    let count = 0;
    for (let i = 0; i < header.inputs.length; i += 2 + engine.OP_ARG_COUNTS[header.inputs[i + 1]]) count++;
    expect(replay.commands).toHaveLength(count);
    expect(replay.commands.find((c) => c.op === engine.OP.BUILD)!.slot).toBeGreaterThanOrEqual(0);
    expect(replay.snapshots.length).toBeLessThanOrEqual(120);
    const end = seekCursor(replay, replay.totalTicks);
    expect(end.state.over).toBe(true);
    expect(engine.getStateHash(end.state)).toBe(engine.getStateHash(driver.state));
  });

  it('하이라이트 — 누수는 3초 안의 것을 한 점으로 합쳐 잃은 목숨 합계, 보스는 처치 순간마다 (games-polish P4)', async () => {
    const { header } = endless;
    const replay = (await prepareReplay(engine, header)) as PreparedReplay;
    // 같은 기록을 따로 돌려 누수·보스 처치를 센다
    const cursor = initialCursor(replay);
    const leaks: { tick: number; lives: number }[] = [];
    const bossKills: number[] = [];
    const kindOf = new Map<number, number>();
    const events: number[] = [];
    advanceCursor(engine, cursor, replay.inputs, replay.totalTicks, events, (ev) => {
      for (let i = 0; ev && i < ev.length; i += engine.EVENT_STRIDE) {
        if (ev[i] === engine.EVENT.SPAWN) kindOf.set(ev[i + 1], ev[i + 2]);
        if (ev[i] === engine.EVENT.LEAK) leaks.push({ tick: cursor.state.tick, lives: ev[i + 2] });
        if (ev[i] === engine.EVENT.DEATH && engine.ENEMIES[kindOf.get(ev[i + 1])!]?.rank === engine.RANK.BOSS) bossKills.push(cursor.state.tick);
      }
    });
    expect(leaks.length).toBeGreaterThan(0);
    const leakMarks = replay.highlights.filter((h) => h.kind === 'leak');
    const bossMarks = replay.highlights.filter((h) => h.kind === 'boss');
    expect(bossKills.length).toBeGreaterThan(0);
    expect(bossMarks.map((h) => h.at)).toEqual(bossKills);
    // 합친 점의 목숨 합 = 실제로 잃은 목숨 합, 점끼리는 3초 넘게 떨어져 있지 않아도 되지만 한 점은 시작에서 3초 안의 누수만 모은다
    expect(leakMarks.reduce((sum, h) => sum + Number(h.detail!.slice(1)), 0)).toBe(leaks.reduce((sum, l) => sum + l.lives, 0));
    expect(leakMarks.length).toBeLessThan(leaks.length + 1);
    expect(leakMarks[0].at).toBe(leaks[0].tick);
    const window = LEAK_MERGE_SECONDS * engine.TICKS_PER_SECOND;
    for (const l of leaks) expect(leakMarks.some((m) => l.tick >= m.at && l.tick - m.at < window)).toBe(true);
    expect(replay.highlights.map((h) => h.at)).toEqual([...replay.highlights.map((h) => h.at)].sort((a, b) => a - b));
  });

  it('탐색 = 처음부터 이어 돌린 상태와 같다(앞·뒤로, 스냅샷 사이 아무 틱)', async () => {
    const { header } = botGame('campaign', 's2', 2);
    const replay = (await prepareReplay(engine, header)) as PreparedReplay;
    const continuous = initialCursor(replay);
    for (const target of [1, 777, Math.floor(replay.totalTicks / 2), replay.totalTicks - 1]) {
      advanceCursor(engine, continuous, replay.inputs, target, null);
      const seeked = seekCursor(replay, target);
      expect(seeked.state.tick).toBe(target);
      expect(engine.getStateHash(seeked.state)).toBe(engine.getStateHash(continuous.state));
    }
    // 뒤로 탐색해도 같은 값
    const back = seekCursor(replay, 777);
    const fresh = initialCursor(replay);
    advanceCursor(engine, fresh, replay.inputs, 777, null);
    expect(engine.getStateHash(back.state)).toBe(engine.getStateHash(fresh.state));
  });

  it('증강 대기가 있는 무한 판도 탐색 = 이어 돌림(대기 틱·그 직후 포함)', async () => {
    const { driver, header } = endless;
    const replay = (await prepareReplay(engine, header)) as PreparedReplay;
    // 증강을 고른 틱(PICK_AUGMENT 명령) — 그 틱과 앞뒤
    const pick = replay.commands.find((c) => c.op === engine.OP.PICK_AUGMENT)!;
    const continuous = initialCursor(replay);
    for (const target of [pick.tick - 1, pick.tick, pick.tick + 1, Math.floor(replay.totalTicks * 0.6)]) {
      advanceCursor(engine, continuous, replay.inputs, target, null);
      expect(engine.getStateHash(seekCursor(replay, target).state)).toBe(engine.getStateHash(continuous.state));
    }
    expect(driver.state.augments.length).toBeGreaterThan(0);
  });

  it('증강을 고르지 않고 멈춘 기록·도중 취소는 오류', async () => {
    const driver = GameDriver.fromBoard('endless', 'endless-s1', 4);
    runGame(driver, greedyBot(), (d) => d.state.augmentPending);
    // 대기에서 멈춘 판을 "더 긴 판"으로 선언 — 대기에 막혀 끝까지 못 간다
    expect(await prepareReplay(engine, { mode: 'endless', boardKey: 'endless-s1', seed: 4, ticks: driver.state.tick + 100, inputs: driver.recorder.inputs })).toBe('INVALID');
    const { header } = endless;
    expect(await prepareReplay(engine, header, undefined, () => true)).toBe('CANCELLED');
  });

  it('깨진 기록·풀 수 없는 보드는 오류', async () => {
    const { header } = botGame('campaign', 's1', 1);
    expect(await prepareReplay(engine, { ...header, boardKey: 's9' })).toBe('BOARD');
    expect(await prepareReplay(engine, { ...header, ticks: header.ticks + 10 })).toBe('INVALID');
    // 판이 끝난 뒤 명령
    expect(await prepareReplay(engine, { ...header, inputs: [...header.inputs, header.ticks, engine.OP.CALL_WAVE] })).toBe('INVALID');
  });

  it('엔진 버전 표 — 현재 버전만(옛 버전은 동결 복사 후 표에 더한다)', async () => {
    expect(canReplayVersion(engine.ENGINE_VERSION)).toBe(true);
    expect(canReplayVersion(engine.ENGINE_VERSION + 1)).toBe(false);
    expect((await loadReplayEngine(engine.ENGINE_VERSION))?.ENGINE_VERSION).toBe(engine.ENGINE_VERSION);
    expect(await loadReplayEngine(1)).toBeNull();
  });
});
