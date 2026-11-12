/**
 * PoC 측정 시나리오 (fortress DESIGN §10 "PoC 측정 항목") — vitest(perf.test.ts)와 plain Node(번들 실행)가 같은 코드를 쓴다
 * 시간은 performance.now 중앙값(ms). 엔진 폴더 밖이라 시간 API를 써도 된다
 */

import {
  type Action,
  type FireInput,
  MAX_ROUNDS,
  type MatchConfig,
  type MatchState,
  TANKS,
  WEAPONS,
  applyAction,
  createMatch,
  fnv1a,
  stateHash,
} from '../engine';
import { type AiLevel, chooseTurn } from '../ai/chooseTurn';
import { playAi } from './goldenCases';

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const round2 = (x: number) => Math.round(x * 100) / 100;

function time(fn: () => void, runs: number): number {
  fn();
  const out: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    out.push(performance.now() - t0);
  }
  return median(out);
}

function start(config: MatchConfig): MatchState {
  const r = createMatch(config);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

const quad = (seed: number, mapId: MatchConfig['mapId']): MatchConfig => ({
  seed,
  mapId,
  mode: 'ffa',
  players: [0, 1, 2, 0].map((tankId, slot) => ({ slot, team: 0, tankId })),
});

/** 경기를 끝까지 돌려 마지막 state (지형이 가장 많이 파인 상태) */
function finalState(config: MatchConfig, actions: readonly Action[]): MatchState {
  let s = start(config);
  for (const a of actions) {
    const r = applyAction(s, a);
    if (!r.ok) throw new Error(r.reason);
    s = r.state;
  }
  return s;
}

/** 지형을 많이 판 상태 — 4인 AI 경기를 끝까지(또는 상한까지) */
function scarredStates(): MatchState[] {
  const out: MatchState[] = [];
  for (const [seed, mapId] of [
    [21, 'hills'],
    [22, 'canyon'],
    [23, 'hills'],
    [24, 'canyon'],
  ] as const) {
    const config = quad(seed, mapId);
    out.push(finalState(config, playAi(config, [1, 1, 1, 1])));
  }
  return out;
}

export type PerfReport = Record<string, number | string>;

export function runPerf(): PerfReport {
  const report: PerfReport = {};

  // (1) 최악 무기 applyAction — 무기마다 각도·파워 격자에서 가장 느린 입력(중앙값 5회)
  for (const weapon of WEAPONS) {
    const tankId = TANKS.findIndex((t) => t.weapons.includes(weapon.id));
    let worst = 0;
    for (const mapId of ['hills', 'canyon'] as const) {
      const config: MatchConfig = { seed: 31, mapId, mode: 'ffa', players: [0, 1, 2, 3].map((slot) => ({ slot, team: 0, tankId })) };
      const s = start(config);
      for (let angle = 15; angle <= 165; angle += 30) {
        for (const power of [40, 70, 100]) {
          const input: FireInput = { kind: 'fire', move: 0, angle, power, weaponId: weapon.id };
          worst = Math.max(worst, time(() => applyAction(s, input), 5));
        }
      }
    }
    report[`applyAction 최악 ms — ${weapon.name}`] = round2(worst);
  }

  // (2) stateHash · state JSON 크기 · 열당 구간 분포 (파인 지형 4판)
  const scarred = scarredStates();
  const fresh = start(quad(21, 'hills'));
  report['stateHash ms (초기)'] = round2(time(() => stateHash(fresh), 50));
  report['stateHash ms (4인 경기 끝, 중앙값)'] = round2(median(scarred.map((s) => time(() => stateHash(s), 50))));
  report['state JSON bytes (초기 hills)'] = JSON.stringify(fresh).length;
  report['state JSON bytes (초기 canyon)'] = JSON.stringify(start(quad(22, 'canyon'))).length;
  report['state JSON bytes (4인 경기 끝, 최대)'] = Math.max(...scarred.map((s) => JSON.stringify(s).length));
  const hist: number[] = [];
  for (const s of scarred) {
    for (const col of s.terrain.cols) {
      const pairs = col.length / 2;
      hist[pairs] = (hist[pairs] ?? 0) + 1;
    }
  }
  report['열당 구간 분포 (4판 × 2048열, 쌍 수: 열 수)'] = hist.map((n, pairs) => (n ? `${pairs}:${n}` : '')).filter(Boolean).join(' ');
  report['지형 정수 개수 (4인 경기 끝, 최대)'] = Math.max(...scarred.map((s) => s.terrain.cols.reduce((sum, c) => sum + c.length, 0)));

  // (3) 리플레이 크기 — 실제 4인 AI 경기와 상한(30라운드 × 4인 = 120턴 전부 발사)
  const config = quad(25, 'hills');
  const actions = playAi(config, [1, 0, 2, 1]);
  report['리플레이 JSON bytes (4인 AI 경기, 행동 수)'] = `${JSON.stringify({ config, turns: actions }).length} (${actions.length})`;
  const maxTurns: Action[] = Array.from({ length: MAX_ROUNDS * 4 }, (_, i) => ({ kind: 'fire', move: -100 + (i % 200), angle: 100 + (i % 80), power: 100, weaponId: 5 }));
  report['리플레이 JSON bytes (상한 120턴)'] = JSON.stringify({ config, turns: maxTurns }).length;

  // (4) AI chooseTurn — 레벨별, 4인 상태 6개 중앙값·최대
  const aiStates = [start(quad(41, 'hills')), start(quad(42, 'canyon')), start(quad(43, 'hills')), ...scarred.slice(0, 3)].filter((s) => s.result.kind === 'ongoing');
  for (const level of [0, 1, 2] as AiLevel[]) {
    const times = aiStates.map((s) => time(() => chooseTurn(s, s.turn.slot, level, fnv1a([level])), 3));
    report[`chooseTurn ms 레벨 ${level} (중앙값 / 최대, 상태 ${aiStates.length}개)`] = `${round2(median(times))} / ${round2(Math.max(...times))}`;
  }
  return report;
}
