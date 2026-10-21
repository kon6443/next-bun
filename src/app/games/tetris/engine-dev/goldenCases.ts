/**
 * 개발 도구 — 골든 리플레이 픽스처 케이스를 실제 플레이로 만든다 (DESIGN §4-4 최소 케이스)
 * 결과 파일: ../engine/__fixtures__/golden-replays.json (백엔드와 바이트 단위로 같은 파일)
 */

import {
  ACTION,
  DEFAULT_ARR,
  DEFAULT_DAS,
  PIECE,
  type ReplayInput,
  type ReplayResult,
  type TSpinKind,
  createGame,
  simulateReplay,
} from '../engine';
import { type Candidate, hardDropCandidates, pickBest, spinCandidates, tSpinOf } from './ai';
import { GameDriver } from './driver';

export type GoldenCase = { name: string; input: ReplayInput; expected: ReplayResult };

type Chooser = (driver: GameDriver) => Candidate | null;

/** 블록마다 choose로 배치하고 stop이 참이 되면 멈춘다 — 이후는 입력 없이 게임 오버까지 */
function play(driver: GameDriver, choose: Chooser, stop: (d: GameDriver) => boolean, maxPieces = 300): boolean {
  while (!driver.state.over && driver.state.pieces < maxPieces) {
    driver.idleUntilActive();
    if (driver.state.over) return false;
    const candidate = choose(driver);
    if (!candidate) return false;
    driver.run(candidate.frames);
    if (driver.state.pieces !== candidate.after.pieces || driver.state.score !== candidate.after.score) {
      throw new Error('후보 실행 결과가 다르다 — 엔진이 결정적이지 않다');
    }
    if (stop(driver)) return true;
  }
  return false;
}

function finish(name: string, driver: GameDriver): GoldenCase {
  driver.idleUntilOver();
  if (!driver.state.over) throw new Error(`${name}: 게임 오버에 도달하지 못했다`);
  const input = driver.toReplayInput();
  const expected = simulateReplay(input);
  if (!expected.ok) throw new Error(`${name}: 리플레이 실패 ${expected.reason}`);
  if (expected.score !== driver.state.score || expected.endFrame !== driver.state.endFrame) {
    throw new Error(`${name}: 실시간 결과와 리플레이 결과가 다르다`);
  }
  return { name, input, expected };
}

/** 시드를 바꿔 가며 조건을 만족하는 판을 찾는다 */
function search(name: string, build: (seed: number) => GameDriver | null, seeds = 300): GoldenCase {
  for (let seed = 1; seed <= seeds; seed++) {
    const driver = build(seed);
    if (driver) return finish(name, driver);
  }
  throw new Error(`${name}: ${seeds}개 시드에서 찾지 못했다`);
}

const stack: Chooser = (d) => pickBest(hardDropCandidates(d.state), { wellColumn: 9, avoidSmallClears: true });

function exactLines(lines: number): GoldenCase {
  return search(`line-clear-${lines}`, (seed) => {
    const d = new GameDriver(seed, DEFAULT_DAS, DEFAULT_ARR);
    const ok = play(
      d,
      (dr) => {
        const candidates = hardDropCandidates(dr.state);
        return candidates.find((c) => c.after.lastLock?.lines === lines) ?? stack(dr);
      },
      (dr) => dr.state.lastLock?.lines === lines,
    );
    return ok ? d : null;
  });
}

function tSpin(kind: TSpinKind, minLines: number): GoldenCase {
  return search(`t-spin-${kind}`, (seed) => {
    const d = new GameDriver(seed, DEFAULT_DAS, DEFAULT_ARR);
    const ok = play(
      d,
      (dr) => {
        if (dr.state.piece === PIECE.T) {
          const spins = spinCandidates(dr.state).filter(
            (c) => tSpinOf(c) === kind && (c.after.lastLock?.lines ?? 0) >= minLines,
          );
          const best = pickBest(spins);
          if (best) return best;
        }
        return pickBest(hardDropCandidates(dr.state), { avoidSmallClears: true });
      },
      (dr) => dr.state.lastLock?.tSpin === kind && dr.state.lastLock.lines >= minLines,
      120,
    );
    return ok ? d : null;
  }, 400);
}

export function buildGoldenCases(): GoldenCase[] {
  const cases: GoldenCase[] = [];

  // 입력 없이 탑아웃
  const idle = new GameDriver(1, DEFAULT_DAS, DEFAULT_ARR);
  const topOut = finish('top-out-no-input', idle);
  cases.push(topOut);

  // 1·2·3·4줄
  for (const lines of [1, 2, 3, 4]) cases.push(exactLines(lines));

  // T-스핀 미니(줄 없음 포함)·일반(1줄 이상)
  cases.push(tSpin('mini', 0));
  cases.push(tSpin('full', 1));

  // 백투백 — 테트리스 두 번 연속
  cases.push(
    search('back-to-back', (seed) => {
      const d = new GameDriver(seed, DEFAULT_DAS, DEFAULT_ARR);
      const ok = play(
        d,
        (dr) => hardDropCandidates(dr.state).find((c) => c.after.lastLock?.lines === 4) ?? stack(dr),
        (dr) => dr.state.lastLock?.backToBack === true,
      );
      return ok ? d : null;
    }),
  );

  // 콤보 — 3번 연속 줄 삭제
  cases.push(
    search('combo', (seed) => {
      const d = new GameDriver(seed, DEFAULT_DAS, DEFAULT_ARR);
      const ok = play(
        d,
        (dr) => {
          const candidates = hardDropCandidates(dr.state);
          const clearing = candidates.filter((c) => (c.after.lastLock?.lines ?? 0) > 0);
          if (dr.state.combo >= 0 && clearing.length > 0) return pickBest(clearing);
          return pickBest(candidates, { avoidSmallClears: true });
        },
        (dr) => (dr.state.lastLock?.combo ?? -1) >= 2,
      );
      return ok ? d : null;
    }),
  );

  // 홀드 — 홀드를 섞어 12블록
  cases.push(
    search('hold', (seed) => {
      const d = new GameDriver(seed, DEFAULT_DAS, DEFAULT_ARR);
      let holds = 0;
      const ok = play(
        d,
        (dr) => {
          if (!dr.state.holdUsed && dr.state.pieces % 3 === 0) {
            holds++;
            return pickBest(hardDropCandidates(dr.state, { useHold: true }));
          }
          return pickBest(hardDropCandidates(dr.state));
        },
        (dr) => dr.state.pieces >= 12,
      );
      return ok && holds >= 3 ? d : null;
    }),
  );

  // DAS/ARR — 누른 채 벽까지 (ARR 0) · 벽에 닿기 전에 떼서 반복 이동 칸 수가 판에 남게 (ARR 3)
  for (const [name, das, arr, holdFrames] of [
    ['das-arr-instant', 6, 0, 7],
    ['das-arr-repeat', 12, 3, 15], // 누름 1칸 + DAS 1칸 + ARR 1칸 = 3칸
  ] as const) {
    const d = new GameDriver(7, das, arr);
    for (let i = 0; i < 8 && !d.state.over; i++) {
      d.idleUntilActive();
      const [press, release] = i % 2 === 0 ? [ACTION.RIGHT_PRESS, ACTION.RIGHT_RELEASE] : [ACTION.LEFT_PRESS, ACTION.LEFT_RELEASE];
      d.step([press]);
      for (let f = 0; f < holdFrames; f++) d.step();
      d.step([release, ACTION.HARD_DROP]);
    }
    cases.push(finish(name, d));
  }

  // I 블록 벽 킥 — 세로로 세워 왼쪽 벽에 붙인 뒤 CW 회전
  cases.push(
    search('i-wall-kick', (seed) => {
      if (createGame({ seed, das: DEFAULT_DAS, arr: DEFAULT_ARR }).piece !== PIECE.I) return null;
      const d = new GameDriver(seed, DEFAULT_DAS, DEFAULT_ARR);
      d.step([ACTION.ROTATE_CW]);
      d.step([ACTION.LEFT_PRESS]);
      for (let f = 0; f < 30; f++) d.step();
      d.step([ACTION.LEFT_RELEASE, ACTION.ROTATE_CW]);
      if (d.state.lastKickIndex === 0 || d.state.rotation !== 2) return null;
      d.step([ACTION.HARD_DROP]);
      return d;
    }),
  );

  // 소프트·하드드롭 점수
  const drops = new GameDriver(3, DEFAULT_DAS, DEFAULT_ARR);
  for (let i = 0; i < 8 && !drops.state.over; i++) {
    drops.idleUntilActive();
    drops.step([ACTION.SOFT_DROP_PRESS]);
    for (let f = 0; f < 15; f++) drops.step();
    drops.step([ACTION.SOFT_DROP_RELEASE, ACTION.HARD_DROP]);
  }
  cases.push(finish('soft-hard-drop', drops));

  // 레벨 상승 — 10줄 이상
  cases.push(
    search('level-up', (seed) => {
      const d = new GameDriver(seed, DEFAULT_DAS, DEFAULT_ARR);
      const ok = play(
        d,
        (dr) => pickBest(hardDropCandidates(dr.state), { clearBonus: 4 }),
        (dr) => dr.state.level >= 2,
      );
      return ok ? d : null;
    }),
  );

  // 실패 사유 4종
  const base = topOut.input;
  const failures: [string, ReplayInput][] = [
    ['fail-invalid-header', { ...base, das: 3 }],
    ['fail-invalid-input', { ...base, inputs: [0, ACTION.HARD_DROP, 0] }],
    ['fail-input-after-end', { ...base, inputs: [base.frames + 5, ACTION.HARD_DROP] }],
    ['fail-not-ended', { ...base, frames: base.frames - 1 }],
  ];
  for (const [name, input] of failures) cases.push({ name, input, expected: simulateReplay(input) });

  return cases;
}

/** 사람이 읽을 수 있게 케이스당 몇 줄로 — 숫자 배열은 한 줄 */
export function formatGoldenJson(cases: GoldenCase[]): string {
  const body = cases
    .map(
      (c) =>
        `  {\n    "name": ${JSON.stringify(c.name)},\n    "input": ${JSON.stringify(c.input)},\n    "expected": ${JSON.stringify(c.expected)}\n  }`,
    )
    .join(',\n');
  return `[\n${body}\n]\n`;
}
