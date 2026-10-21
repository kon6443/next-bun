/**
 * 골든 리플레이 케이스 — 실제 플레이(봇·손작성)로 만든 판 + 실패 사유별 케이스 (§E7)
 * 기대값은 생성 시점의 simulateReplay 결과 — 두 레포(프론트·백엔드)가 같은 파일로 같은 결과를 단정한다
 */

import { MAX_INPUT_LENGTH, MAX_TICKS, OP, type ReplayInput, type ReplayResult, STAGE_E1, TARGET, simulateReplay } from '../engine';
import { playWithBot } from './bot';
import { GameDriver } from './driver';

export type GoldenCase = { name: string; input: ReplayInput; expected: ReplayResult };

const ARCHER = 0;

function botGame(seed: number, options: Parameters<typeof playWithBot>[1]): ReplayInput {
  const driver = new GameDriver(STAGE_E1, seed);
  playWithBot(driver, options);
  return driver.toReplayInput();
}

/** 방어 없이 1웨이브만 부르고 끝까지 — 누수로 패배 */
function noDefense(): ReplayInput {
  const driver = new GameDriver(STAGE_E1, 3);
  driver.must(OP.CALL_WAVE);
  driver.run(MAX_TICKS);
  return driver.toReplayInput();
}

/** 같은 준비 단계 판매(100%)·웨이브 뒤 판매(70%)·타게팅 4종·일시정지 중 같은 틱 명령 여러 개 */
function sellAndRetarget(): ReplayInput {
  const driver = new GameDriver(STAGE_E1, 11);
  driver.must(OP.BUILD, 0, ARCHER);
  driver.must(OP.SELL, 0); // 같은 준비 단계 — 100%
  driver.must(OP.BUILD, 1, ARCHER);
  driver.must(OP.BUILD, 2, ARCHER);
  driver.must(OP.BUILD, 3, ARCHER);
  driver.must(OP.SET_TARGET, 1, TARGET.LAST);
  driver.must(OP.SET_TARGET, 2, TARGET.STRONGEST);
  driver.must(OP.SET_TARGET, 3, TARGET.NEAREST);
  driver.must(OP.CALL_WAVE);
  driver.run(400);
  driver.must(OP.SELL, 3); // 웨이브가 시작된 뒤 — 70%
  driver.runUntil((s) => s.gold >= 70);
  driver.must(OP.BUILD, 4, ARCHER);
  driver.runUntil((s) => s.gold >= 50);
  // 일시정지 중처럼 같은 틱에 연달아
  driver.must(OP.UPGRADE, 1);
  driver.must(OP.SET_TARGET, 1, TARGET.FIRST);
  driver.runUntil((s) => s.countdown > 0);
  driver.must(OP.CALL_WAVE); // 조기 호출
  driver.run(MAX_TICKS);
  return driver.toReplayInput();
}

/** 실패 케이스의 바탕 — 짧게 이기는 판 */
function baseWin(): ReplayInput {
  return botGame(5, { earlyCallAbove: 300 });
}

function withInputs(base: ReplayInput, inputs: number[], patch: Partial<ReplayInput> = {}): ReplayInput {
  return { ...base, ...patch, inputs };
}

export function buildGoldenCases(): GoldenCase[] {
  const win = baseWin();
  const lose = noDefense();
  const inputs: [string, ReplayInput][] = [
    ['bot-victory', botGame(7, {})],
    ['bot-early-call', win],
    ['bot-two-towers', botGame(9, { maxTowers: 2 })],
    ['bot-one-tower-leaks', botGame(13, { maxTowers: 1 })],
    ['no-defense-defeat', lose],
    ['sell-and-retarget', sellAndRetarget()],
    ['one-tower-no-upgrade-defeat', botGame(17, { maxTowers: 1, noUpgrade: true })],
    ['idle-until-max-ticks', { mode: 'campaign', boardKey: 'e1', seed: 0, ticks: MAX_TICKS, inputs: [] }],
    // ---- 실패 사유 (§E4) ----
    ['fail-header-mode-endless', { ...win, mode: 'endless' }],
    ['fail-header-unknown-board', { ...win, boardKey: 's9' }],
    ['fail-header-seed-range', { ...win, seed: -1 }],
    ['fail-header-ticks-zero', { ...win, ticks: 0 }],
    ['fail-header-ticks-fraction', { ...win, ticks: win.ticks + 0.5 }],
    ['fail-input-truncated-args', withInputs(win, [0, OP.BUILD, 0])],
    ['fail-input-unknown-op', withInputs(win, [0, 9])],
    ['fail-input-negative-delta', withInputs(win, [0, OP.CALL_WAVE, -1, OP.CALL_WAVE])],
    ['fail-input-arg-range', withInputs(win, [0, OP.SET_TARGET, 0, 4])],
    ['fail-command-not-enough-gold', withInputs(win, [0, OP.BUILD, 0, ARCHER, 0, OP.BUILD, 1, ARCHER, 0, OP.BUILD, 2, ARCHER, 0, OP.BUILD, 3, ARCHER])],
    ['fail-command-branch', withInputs(win, [0, OP.BUILD, 0, ARCHER, 0, OP.BRANCH, 0, 0])],
    ['fail-command-pick-augment', withInputs(win, [0, OP.PICK_AUGMENT, 0])],
    ['fail-command-call-while-spawning', withInputs(win, [0, OP.CALL_WAVE, 10, OP.CALL_WAVE])],
    ['fail-command-upgrade-empty', withInputs(win, [0, OP.UPGRADE, 5])],
    ['fail-after-end', withInputs(lose, [...lose.inputs, lose.ticks, OP.BUILD, 0, ARCHER])],
    // 게임은 안 끝났는데 선언 ticks 뒤에 명령 — INPUT_AFTER_END(선언한 끝 이후)
    ['fail-after-declared-ticks', { mode: 'campaign', boardKey: 'e1', seed: 1, ticks: 100, inputs: [200, OP.CALL_WAVE] }],
    ['fail-not-ended-short', { ...win, ticks: win.ticks - 1 }],
    ['fail-not-ended-long', { ...win, ticks: win.ticks + 1 }],
    ['fail-limit-ticks', { ...win, ticks: MAX_TICKS + 1 }],
    ['fail-limit-input-length', withInputs(win, new Array(MAX_INPUT_LENGTH + 2).fill(0))],
  ];
  return inputs.map(([name, input]) => ({ name, input, expected: simulateReplay(input) }));
}

/** 케이스 하나를 한 줄 가깝게 — 사람이 diff로 읽을 수 있게 */
export function formatGoldenJson(cases: GoldenCase[]): string {
  const body = cases
    .map(
      (c) =>
        `  {\n    "name": ${JSON.stringify(c.name)},\n    "input": ${JSON.stringify(c.input)},\n    "expected": ${JSON.stringify(c.expected)}\n  }`,
    )
    .join(',\n');
  return `[\n${body}\n]\n`;
}
