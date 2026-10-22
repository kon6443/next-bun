import { describe, it, expect } from 'vitest';
import {
  OP,
  TOWER_ID,
  applyCommand,
  buildCost,
  createCommandRecorder,
  createGame,
  findStage,
  getStateHash,
  recordCommand,
  simulateReplay,
  step,
  upgradeCost,
} from '../engine';
import { starsFor } from './campaign';

/**
 * 메인 Playwright S1 클리어 조작 가이드의 근거 — 화면 조작과 같은 정책을 엔진으로 돌려 깬다는 것을 지킨다
 * 정책: 슬롯 탭 → 링 항목 2탭(아래 순서) · 골드가 모자라면 기다림 · 1웨이브만 "웨이브 시작"(뒤 웨이브는 카운트다운이 자동으로 연다)
 * 자동화는 골드(data-value)를 주기적으로 읽어 조작한다 — 반응이 20틱(0.67초 · 3×면 실제 0.22초) 늦어도 깨는지 본다
 * 순서는 시뮬레이터 각본 봇 S1(engine-dev/sim/scripts.ts) 그대로: [슬롯, 'build-1'(대포)] · [슬롯, 'upgrade']
 */
const C = TOWER_ID.CANNON;
const S1_GUIDE: readonly { slot: number; action: 'build' | 'upgrade'; kind?: number }[] = [
  { slot: 7, action: 'build', kind: C },
  { slot: 5, action: 'build', kind: C },
  { slot: 6, action: 'build', kind: C },
  { slot: 7, action: 'upgrade' },
  { slot: 5, action: 'upgrade' },
  { slot: 6, action: 'upgrade' },
  { slot: 1, action: 'build', kind: C },
  { slot: 1, action: 'upgrade' },
  { slot: 3, action: 'build', kind: C },
  { slot: 3, action: 'upgrade' },
  { slot: 7, action: 'upgrade' },
  { slot: 0, action: 'build', kind: C },
  { slot: 0, action: 'upgrade' },
  { slot: 5, action: 'upgrade' },
  { slot: 4, action: 'build', kind: C },
];

function playGuide(boardKey: string, seed: number, reactionTicks: number) {
  const stage = findStage(boardKey)!;
  const state = createGame(stage, seed);
  const recorder = createCommandRecorder();
  const send = (op: number, a = 0, b = 0) => {
    if (!applyCommand(state, op, a, b)) return false;
    recordCommand(recorder, state.tick, op, a, b);
    return true;
  };
  let next = 0;
  const act = () => {
    while (next < S1_GUIDE.length) {
      const s = S1_GUIDE[next];
      const cost = s.action === 'build' ? buildCost(state, s.kind!) : upgradeCost(state, s.slot);
      if (cost > 0 && state.gold < cost) break;
      // 화면의 링 항목이 사라지면(업그레이드 상한·슬롯 변경) 가이드가 깨진다 — 모든 명령이 수락되는지 본다
      expect(s.action === 'build' ? send(OP.BUILD, s.slot, s.kind) : send(OP.UPGRADE, s.slot)).toBe(true);
      next++;
    }
  };
  act();
  expect(send(OP.CALL_WAVE)).toBe(true);
  while (!state.over && state.tick < 200_000) {
    step(state);
    if (state.tick % reactionTicks === 0) act();
  }
  return { state, replay: { mode: 'campaign', boardKey, seed, ticks: state.endTick, inputs: recorder.inputs } };
}

describe('S1 클리어 조작 가이드 (메인 Playwright용)', () => {
  it('보통 · seed 1~5 · 반응 20틱 늦어도 승리 — 별 2개 이상, 명령 로그를 리플레이하면 같은 결과', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const { state, replay } = playGuide('s1', seed, 20);
      expect(state.victory).toBe(true);
      expect(starsFor(state.lives)).toBeGreaterThanOrEqual(2);
      expect(simulateReplay(replay)).toMatchObject({ ok: true, stateHash: getStateHash(state) });
    }
  });

  it('쉬움도 같은 순서로 승리', () => {
    expect(playGuide('s1-easy', 1, 20).state.victory).toBe(true);
  });
});
