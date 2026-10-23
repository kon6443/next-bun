import { describe, it, expect } from 'vitest';
import { BOARD_PARAM, DEFENSE_SESSION_TTL_MS, boardTabs, selectBoard, weeklyReplayState } from './rankedBoards';

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
