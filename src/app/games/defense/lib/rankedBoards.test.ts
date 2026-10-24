import { describe, it, expect } from 'vitest';
import { BOARD_PARAM, DEFENSE_SESSION_TTL_MS, ENDLESS_BOARD_KEY, boardTabs, currentEndlessBoardKey, selectBoard, weeklyBoardKeyAt, weeklyReplayState } from './rankedBoards';

const BOARDS = [
  { boardKey: 'endless-s1', mode: 'endless', current: true },
  { boardKey: 'weekly-2026-w43', mode: 'weekly', current: true },
  { boardKey: 'weekly-2026-w42', mode: 'weekly', current: false },
];

describe('랭킹 보드 탭 (/boards → 탭)', () => {
  it('무한 현재 → 주간 이번 주 → 지난 주 순, 표기', () => {
    expect(boardTabs(BOARDS).map((t) => [t.boardKey, t.label])).toEqual([
      ['endless-s1', '무한 시즌 1'],
      ['weekly-2026-w43', '이번 주 W43'],
      ['weekly-2026-w42', '지난 주 W42'],
    ]);
  });
  it('목록을 못 받으면 무한 시즌 하나, 모르는 보드·모드가 어긋난 보드는 뺀다', () => {
    expect(boardTabs(null).map((t) => t.boardKey)).toEqual(['endless-s1']);
    expect(boardTabs([{ boardKey: 'default', mode: null, current: true }, { boardKey: 'weekly-2026-w43', mode: 'endless', current: true }]).map((t) => t.boardKey)).toEqual(['endless-s1']);
  });
  it('?board= — 별칭은 그 모드 현재 보드, 보드 키는 그대로, 없으면 첫 탭', () => {
    const tabs = boardTabs(BOARDS);
    expect(selectBoard(tabs, 'weekly')).toBe('weekly-2026-w43');
    expect(selectBoard(tabs, 'endless')).toBe('endless-s1');
    expect(selectBoard(tabs, 'weekly-2026-w30')).toBe('weekly-2026-w30');
    expect(selectBoard(tabs, null)).toBe('endless-s1');
    // 주간 보드가 없을 때(서버 설정) 별칭 weekly는 첫 탭으로
    expect(selectBoard(boardTabs(null), 'weekly')).toBe('endless-s1');
  });
  it('주간 리플레이 공개 — 주 끝 + 세션 TTL(4시간)부터(D-032), 경계 고정', () => {
    const endsAt = '2026-10-25T15:00:00.000Z';
    const end = Date.parse(endsAt);
    expect(DEFENSE_SESSION_TTL_MS).toBe(4 * 60 * 60 * 1000);
    expect(weeklyReplayState('weekly-2026-w43', endsAt, end - 1)).toBe('running');
    expect(weeklyReplayState('weekly-2026-w43', endsAt, end)).toBe('soon');
    expect(weeklyReplayState('weekly-2026-w43', endsAt, end + DEFENSE_SESSION_TTL_MS - 1)).toBe('soon');
    expect(weeklyReplayState('weekly-2026-w43', endsAt, end + DEFENSE_SESSION_TTL_MS)).toBe('open');
  });

  it('endsAt을 모르면 보드 키로 — 이번 주 running, 주 경계 직후 4시간은 막 끝난 주 soon', () => {
    // 2026-10-26(월) 01:00 KST = 2026-10-25T16:00Z — 주 경계(15:00Z) 1시간 뒤
    const now = Date.parse('2026-10-25T16:00:00Z');
    expect(weeklyReplayState('weekly-2026-w44', null, now)).toBe('running');
    expect(weeklyReplayState('weekly-2026-w43', null, now)).toBe('soon');
    expect(weeklyReplayState('weekly-2026-w43', null, now + DEFENSE_SESSION_TTL_MS)).toBe('open');
    expect(weeklyReplayState('weekly-2026-w40', undefined, now)).toBe('open');
  });

  it('쿼리 형식 검사', () => {
    expect(['endless', 'weekly', 'endless-s2', 'weekly-2026-w43'].every((v) => BOARD_PARAM.test(v))).toBe(true);
    expect(['', 'default', 'weekly-2026-43', 'endless-s', '../x'].some((v) => BOARD_PARAM.test(v))).toBe(false);
  });
});

describe('주간 보드 키 — 서버(weekly-board.ts)와 같은 규칙: KST 월요일 00:00 경계 + ISO 8601 주차(목요일이 속한 해) (Q-D2)', () => {
  it('KST 월요일 00:00이 경계 — 일요일 23:59:59 KST까지는 앞 주', () => {
    // 2026-10-26(월) 00:00 KST = 2026-10-25T15:00Z
    expect(weeklyBoardKeyAt(Date.parse('2026-10-25T14:59:59.999Z'))).toBe('weekly-2026-w43');
    expect(weeklyBoardKeyAt(Date.parse('2026-10-25T15:00:00Z'))).toBe('weekly-2026-w44');
  });

  it('연말 — 1월 1일이 목요일인 해(2026)는 12월 29일 월요일부터 그 해 W01', () => {
    expect(weeklyBoardKeyAt(Date.parse('2025-12-28T14:59:59Z'))).toBe('weekly-2025-w52');
    expect(weeklyBoardKeyAt(Date.parse('2025-12-28T15:00:00Z'))).toBe('weekly-2026-w01');
  });

  it('53주 해 — 2026은 W53이 있고 2027-01-03(일)까지 이어진다, 2027-01-04(월) KST부터 2027 W01', () => {
    expect(weeklyBoardKeyAt(Date.parse('2026-12-27T15:00:00Z'))).toBe('weekly-2026-w53');
    expect(weeklyBoardKeyAt(Date.parse('2027-01-03T14:59:59Z'))).toBe('weekly-2026-w53');
    expect(weeklyBoardKeyAt(Date.parse('2027-01-03T15:00:00Z'))).toBe('weekly-2027-w01');
  });

  it('UTC로는 아직 일요일이어도 KST로 월요일이면 새 주(UTC 기준으로 계산하지 않는다)', () => {
    // 2026-01-04T20:00Z = 2026-01-05(월) 05:00 KST
    expect(weeklyBoardKeyAt(Date.parse('2026-01-04T20:00:00Z'))).toBe('weekly-2026-w02');
  });
});

describe('현재 무한 시즌 키 (games-polish FE-07)', () => {
  it('/boards의 current 무한 보드 — 시즌이 오르면 그 키, 지난 시즌·주간은 고르지 않는다', () => {
    const boards = [
      { boardKey: 'endless-s2', mode: 'endless', current: true },
      { boardKey: 'endless-s1', mode: 'endless', current: false },
      { boardKey: 'weekly-2026-w43', mode: 'weekly', current: true },
    ];
    expect(currentEndlessBoardKey(boards)).toBe('endless-s2');
  });

  it('목록이 없거나(실패·응답 전) 무한 current가 없으면 폴백', () => {
    expect(currentEndlessBoardKey(null)).toBe(ENDLESS_BOARD_KEY);
    expect(currentEndlessBoardKey([{ boardKey: 'weekly-2026-w43', mode: 'weekly', current: true }])).toBe(ENDLESS_BOARD_KEY);
  });
});
