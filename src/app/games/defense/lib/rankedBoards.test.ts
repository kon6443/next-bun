import { describe, it, expect } from 'vitest';
import { BOARD_PARAM, boardTabs, selectBoard } from './rankedBoards';

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
  it('쿼리 형식 검사', () => {
    expect(['endless', 'weekly', 'endless-s2', 'weekly-2026-w43'].every((v) => BOARD_PARAM.test(v))).toBe(true);
    expect(['', 'default', 'weekly-2026-43', 'endless-s', '../x'].some((v) => BOARD_PARAM.test(v))).toBe(false);
  });
});
