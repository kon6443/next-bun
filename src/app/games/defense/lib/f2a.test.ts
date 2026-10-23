import { describe, it, expect } from 'vitest';
import { AUGMENTS, ENGINE_VERSION, OP, RULE_COUNT, TOWER_ID, getStateHash, resolveBoard, step } from '../engine';
import { GameDriver } from '../engine-dev/driver';
import { greedyBot } from '../engine-dev/sim/bots';
import { runGame } from '../engine-dev/sim/runner';
import { AUGMENT_TEXT, RULE_TEXT, bannedRuleText } from './labels';
import { boardShortTitle, boardTitle, modeOfBoardKey, weeklyBoardKeyAt } from './rankedBoards';
import { restoreGame } from './restoreGame';

describe('F2a 데이터 — 증강·주간 규칙 문구', () => {
  it('카드 24장·규칙 15개 모두 이름과 설명이 있다', () => {
    expect(AUGMENT_TEXT).toHaveLength(AUGMENTS.length);
    for (const t of AUGMENT_TEXT) expect(t.name && t.desc).toBeTruthy();
    expect(RULE_TEXT).toHaveLength(RULE_COUNT + 1);
    for (const t of RULE_TEXT.slice(1)) expect(t.icon && t.name && t.desc).toBeTruthy();
  });
  it('금지 규칙은 이번 주 금지 타워 이름 + 맞는 조사', () => {
    expect(bannedRuleText(TOWER_ID.CANNON)).toBe('대포를 지을 수 없다');
    expect(bannedRuleText(TOWER_ID.ARCHER)).toBe('궁수탑을 지을 수 없다');
    expect(bannedRuleText(-1)).toBe(RULE_TEXT[6].desc);
  });
});

describe('rankedBoards — 보드 키·표기', () => {
  it('주간 키는 KST 월요일 00:00 경계의 ISO 주차', () => {
    expect(weeklyBoardKeyAt(Date.parse('2026-10-22T13:00:00Z'))).toBe('weekly-2026-w43');
    // 2026-10-19(월) 00:00 KST = 2026-10-18T15:00Z
    expect(weeklyBoardKeyAt(Date.parse('2026-10-18T15:00:00Z'))).toBe('weekly-2026-w43');
    expect(weeklyBoardKeyAt(Date.parse('2026-10-18T14:59:59Z'))).toBe('weekly-2026-w42');
    // 해 경계 — 2027-01-01(금)은 2026년 53주, 2027-01-04(월)부터 2027년 1주
    expect(weeklyBoardKeyAt(Date.parse('2027-01-01T03:00:00Z'))).toBe('weekly-2026-w53');
    expect(weeklyBoardKeyAt(Date.parse('2027-01-04T00:00:00Z'))).toBe('weekly-2027-w01');
  });
  it('표기·모드 판정', () => {
    expect(boardTitle('weekly-2026-w43')).toBe('W43 주간 도전');
    expect(boardTitle('endless-s1')).toBe('무한 모드 시즌 1');
    expect(boardShortTitle('weekly-2026-w07')).toBe('W7');
    expect([modeOfBoardKey('endless-s1'), modeOfBoardKey('weekly-2026-w43'), modeOfBoardKey('s1-hard')]).toEqual(['endless', 'weekly', null]);
  });
});

/** 무한 판을 첫 증강 대기까지 — 봇은 대기에서 멈추게(until) */
function endlessUntilAugment(seed = 1): GameDriver {
  const driver = GameDriver.fromBoard('endless', 'endless-s1', seed);
  runGame(driver, greedyBot(), (d) => d.state.augmentPending);
  return driver;
}

describe('restoreGame — 증강 대기(무한·주간)', () => {
  it('대기 중에 저장한 판은 대기 상태 그대로, 고른 뒤 저장한 판은 그 틱의 상태로 — 해시 일치', () => {
    const driver = endlessUntilAugment();
    const stage = resolveBoard('endless', 'endless-s1', 1)!;
    expect(driver.state.augmentPending).toBe(true);
    const pending = restoreGame(stage, 1, driver.recorder.inputs, driver.state.tick)!;
    expect(pending.state.augmentPending).toBe(true);
    expect(getStateHash(pending.state)).toBe(getStateHash(driver.state));

    driver.must(OP.PICK_AUGMENT, 1);
    for (let i = 0; i < 300 && !driver.state.over; i++) step(driver.state);
    const after = restoreGame(stage, 1, driver.recorder.inputs, driver.state.tick)!;
    expect(after.state.augments).toEqual(driver.state.augments);
    expect(getStateHash(after.state)).toBe(getStateHash(driver.state));
    expect(ENGINE_VERSION).toBe(3);
  });

  it('대기를 지나 뒤 틱으로 미룬 명령은 손상된 로그(simulateReplay와 같다)', () => {
    const driver = endlessUntilAugment();
    const stage = resolveBoard('endless', 'endless-s1', 1)!;
    // 대기 중인데 1틱 뒤에 고른다는 로그 — 엔진은 대기 중 틱을 돌리지 않으므로 수행할 수 없다
    const inputs = [...driver.recorder.inputs, 1, OP.PICK_AUGMENT, 0];
    expect(restoreGame(stage, 1, inputs, driver.state.tick + 1)).toBeNull();
    // 저장 틱이 대기 틱보다 뒤면(대기에서 멈춘 판) 그 틱까지 갈 수 없다
    expect(restoreGame(stage, 1, driver.recorder.inputs, driver.state.tick + 5)).toBeNull();
  });
});
