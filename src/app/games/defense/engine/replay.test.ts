import { describe, it, expect } from 'vitest';
import { ENGINE_VERSION, OP } from './constants';
import { STAGE_E1, STAGE_E2 } from './data/stages';
import { playWithBot } from '../engine-dev/bot';
import { GameDriver } from '../engine-dev/driver';
import { applyCommand, createGame, getStateHash, step } from './game';
import { type ReplayInput, type ReplayResult, buildReplay, createCommandRecorder, recordCommand, simulateReplay } from './replay';
import golden from './__fixtures__/golden-replays.json';

type GoldenCase = { name: string; input: ReplayInput; expected: ReplayResult };
const cases = golden as GoldenCase[];

describe('골든 리플레이 픽스처 (백엔드와 같은 파일)', () => {
  it('실패 사유 6종이 모두 있고, 성공 판이 여러 개 있다', () => {
    const reasons = new Set(cases.filter((c) => !c.expected.ok).map((c) => (c.expected as { reason: string }).reason));
    expect([...reasons].sort()).toEqual(['INPUT_AFTER_END', 'INVALID_COMMAND', 'INVALID_HEADER', 'INVALID_INPUT', 'LIMIT_EXCEEDED', 'NOT_ENDED']);
    expect(cases.filter((c) => c.expected.ok).length).toBeGreaterThanOrEqual(5);
    // 승리·패배가 모두 있다
    const lives = cases.filter((c) => c.expected.ok).map((c) => (c.expected as { livesLeft: number }).livesLeft);
    expect(lives).toContain(0);
    expect(lives.some((l) => l > 0)).toBe(true);
  });

  for (const c of cases) {
    it(c.name, () => {
      expect(simulateReplay(c.input)).toEqual(c.expected);
    });
  }

  it('같은 입력 2회 — 같은 해시 (결정성)', () => {
    for (const c of cases.filter((x) => x.expected.ok)) {
      expect(simulateReplay(c.input)).toEqual(simulateReplay(c.input));
    }
  });
});

describe('실시간 기록 → 리플레이', () => {
  it('수락한 명령만 처리 완료 틱 수로 기록하면 리플레이 결과·해시가 실시간 상태와 같다', () => {
    const state = createGame(STAGE_E1, 99);
    const recorder = createCommandRecorder();
    const send = (op: number, a = 0, b = 0) => {
      if (applyCommand(state, op, a, b)) recordCommand(recorder, state.tick, op, a, b);
    };
    send(OP.BUILD, 0, 0);
    send(OP.BUILD, 0, 0); // 거부 — 기록되지 않는다
    send(OP.BUILD, 1, 0);
    send(OP.CALL_WAVE);
    for (let t = 0; !state.over && t < 20000; t++) {
      if (t % 200 === 0) {
        send(OP.BUILD, 2 + (t / 200) % 6, 0);
        send(OP.UPGRADE, 0);
      }
      if (state.countdown > 0) send(OP.CALL_WAVE);
      step(state);
    }
    expect(state.over).toBe(true);
    const replay = buildReplay(state, recorder);
    expect(replay.engineVersion).toBe(ENGINE_VERSION);
    const result = simulateReplay({ mode: 'campaign', boardKey: 'e1', seed: 99, ticks: replay.frames, inputs: replay.inputs });
    expect(result).toMatchObject({ ok: true, endTick: state.endTick, stateHash: getStateHash(state), kills: state.kills, livesLeft: state.lives });
  });

  it('E2 아레나(분기·궁극·증강 PICK) 실시간 판 = 리플레이 결과 — wavesStarted·augments 포함', () => {
    const driver = new GameDriver(STAGE_E2, 5);
    playWithBot(driver, { kinds: [0, 1, 2, 3, 4, 5], branch: 1, pick: 2, earlyCallAbove: 200, maxTowers: 4 });
    const s = driver.state;
    expect(s.augments.length).toBeGreaterThan(0);
    expect(s.towers.some((t) => t.level === 5)).toBe(true);
    const result = simulateReplay(driver.toReplayInput());
    expect(result).toMatchObject({ ok: true, stateHash: getStateHash(s), wavesStarted: s.wavesStarted, augments: s.augments, endTick: s.endTick });
  });

  it('기록 형식: [deltaTick, op, ...인자] — op별 인자 수 고정', () => {
    const recorder = createCommandRecorder();
    recordCommand(recorder, 0, OP.BUILD, 3, 0);
    recordCommand(recorder, 0, OP.CALL_WAVE, 7, 7); // 인자 없는 op — 넘겨도 싣지 않는다
    recordCommand(recorder, 45, OP.SET_TARGET, 3, 2);
    recordCommand(recorder, 45, OP.SELL, 3);
    expect(recorder.inputs).toEqual([0, 1, 3, 0, 0, 0, 45, 5, 3, 2, 0, 4, 3]);
  });
});
