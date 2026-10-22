/**
 * 골든 리플레이 케이스 — 실제 플레이(봇·손작성)로 만든 판 + 실패 사유별 케이스 (§E7)
 * 기대값은 생성 시점의 simulateReplay 결과 — 두 레포(프론트·백엔드)가 같은 파일로 같은 결과를 단정한다
 */

import {
  MAX_INPUT_LENGTH,
  MAX_TICKS,
  OP,
  type ReplayInput,
  type ReplayResult,
  STAGE_E1,
  STAGE_E2,
  STAGE_E2_RULES,
  type Stage,
  TARGET,
  TOWER_ID,
  simulateReplay,
} from '../engine';
import { playWithBot } from './bot';
import { type Bot, greedyBot, noviceBot, scriptedBot } from './sim/bots';
import { runGame } from './sim/runner';
import { CAMPAIGN_SCRIPTS } from './sim/scripts';
import { GameDriver } from './driver';

export type GoldenCase = { name: string; input: ReplayInput; expected: ReplayResult };

const ARCHER = 0;

function botGame(seed: number, options: Parameters<typeof playWithBot>[1], stage: Stage = STAGE_E1): ReplayInput {
  const driver = new GameDriver(stage, seed);
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

const ALL_KINDS = [TOWER_ID.ARCHER, TOWER_ID.CANNON, TOWER_ID.MAGE, TOWER_ID.FROST, TOWER_ID.CROSSBOW, TOWER_ID.TESLA];

/** E2 아레나 손작성 — 잠긴 슬롯은 막혀 있고, 증강 대기 중 같은 틱 PICK, 대상 지정·판매 */
function e2Manual(): ReplayInput {
  const driver = new GameDriver(STAGE_E2, 23);
  driver.must(OP.BUILD, 0, TOWER_ID.FROST);
  driver.must(OP.BUILD, 1, TOWER_ID.TESLA);
  driver.must(OP.BUILD, 6, TOWER_ID.CANNON);
  driver.must(OP.SET_TARGET, 6, TARGET.STRONGEST);
  driver.must(OP.CALL_WAVE);
  driver.runUntil((s) => s.augmentPending);
  driver.must(OP.PICK_AUGMENT, 2);
  driver.runUntil((s) => s.gold >= 200);
  driver.must(OP.BUILD, 9, TOWER_ID.CROSSBOW);
  driver.must(OP.SELL, 0);
  playWithBot(driver, { kinds: ALL_KINDS, branch: 1, pick: 1, earlyCallAbove: 400 });
  return driver.toReplayInput();
}

/** 시뮬레이터 봇으로 헤더(mode·boardKey·seed)의 판을 끝까지 */
function simGame(mode: string, boardKey: string, seed: number, bot: Bot): ReplayInput {
  const driver = GameDriver.fromBoard(mode, boardKey, seed);
  runGame(driver, bot);
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
    // ---- E2 아레나: 타워 6종·분기·궁극·적 11종·증강·다중 경로 ----
    ['e2-bot-branch-a', botGame(31, { kinds: ALL_KINDS, branch: 0, pick: 0 }, STAGE_E2)],
    ['e2-bot-branch-b', botGame(37, { kinds: ALL_KINDS, branch: 1, pick: 2, earlyCallAbove: 300 }, STAGE_E2)],
    ['e2-lv5-branch-a', botGame(53, { kinds: ALL_KINDS, branch: 0, pick: 1, maxTowers: 4 }, STAGE_E2)],
    ['e2-lv5-branch-b', botGame(59, { kinds: [...ALL_KINDS].reverse(), branch: 1, pick: 0, maxTowers: 4, earlyCallAbove: 200 }, STAGE_E2)],
    ['e2-bot-reverse-kinds', botGame(41, { kinds: [...ALL_KINDS].reverse(), branch: 1, pick: 1 }, STAGE_E2)],
    ['e2-two-towers-defeat', botGame(43, { kinds: [TOWER_ID.ARCHER], maxTowers: 2, noUpgrade: true }, STAGE_E2)],
    ['e2-manual', e2Manual()],
    ['e2-rules-bot', botGame(47, { kinds: ALL_KINDS, branch: 0, pick: 0 }, STAGE_E2_RULES)],
    // ---- S1: 캠페인 8스테이지(난이도 접미사) · 무한 · 주간 ----
    ['campaign-s1-greedy', simGame('campaign', 's1', 1, greedyBot())],
    ['campaign-s4-scripted', simGame('campaign', 's4', 2, scriptedBot(CAMPAIGN_SCRIPTS[3]))],
    ['campaign-s3-easy-novice', simGame('campaign', 's3-easy', 3, noviceBot(3))],
    ['campaign-s8-hard-greedy', simGame('campaign', 's8-hard', 4, greedyBot())],
    ['endless-greedy', simGame('endless', 'endless-s1', 1, greedyBot())],
    ['endless-greedy-early-call', simGame('endless', 'endless-s1', 2, greedyBot({ earlyCall: true }))],
    ['endless-novice', simGame('endless', 'endless-s1', 3, noviceBot(3))],
    ['weekly-w43-greedy', simGame('weekly', 'weekly-2026-w43', 123456789, greedyBot())],
    ['weekly-w44-greedy', simGame('weekly', 'weekly-2026-w44', 987654321, greedyBot())],
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
    ['fail-header-weekly-week-00', { ...win, mode: 'weekly', boardKey: 'weekly-2026-w00' }],
    ['fail-header-endless-unknown-season', { ...win, mode: 'endless', boardKey: 'endless-s2' }],
    ['fail-header-campaign-unknown-difficulty', { ...win, boardKey: 's3-nightmare' }],
    ['fail-command-locked-slot', { mode: 'campaign', boardKey: 'e2', seed: 1, ticks: 100, inputs: [0, OP.BUILD, 12, TOWER_ID.ARCHER] }],
    ['fail-command-banned-tower', { mode: 'campaign', boardKey: 'e2-rules', seed: 1, ticks: 100, inputs: [0, OP.BUILD, 0, TOWER_ID.TESLA] }],
    ['fail-command-upgrade-needs-branch', { mode: 'campaign', boardKey: 'e2', seed: 1, ticks: 100, inputs: [0, OP.BUILD, 0, TOWER_ID.ARCHER, 0, OP.UPGRADE, 0, 0, OP.UPGRADE, 0, 0, OP.UPGRADE, 0] }],
    ['fail-command-ceiling-branch', { mode: 'campaign', boardKey: 'e2-rules', seed: 1, ticks: 100, inputs: [0, OP.BUILD, 0, TOWER_ID.ARCHER, 0, OP.UPGRADE, 0, 0, OP.UPGRADE, 0, 0, OP.BRANCH, 0, 0, 0, OP.UPGRADE, 0] }],
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
