// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { attachDailyRank, dailyBoards, dailyDateLabel, dailyReplayState, dailyShareText, isDailyBoardKey, loadDailyFirstRun, recordDailyRun } from './daily';

const KEY = 'daily-2026-10-24';
// 2026-10-24(KST)이 끝나는 순간 = 2026-10-24T15:00Z
const END = Date.parse('2026-10-24T15:00:00Z');
const HOUR = 60 * 60 * 1000;

describe('오늘의 테트리스 보드 (games-growth B1)', () => {
  it('보드 키·날짜 표기', () => {
    expect(isDailyBoardKey(KEY)).toBe(true);
    expect(isDailyBoardKey('default')).toBe(false);
    expect(dailyDateLabel(KEY)).toBe('10/24');
    expect(dailyDateLabel('daily-2026-01-05')).toBe('1/5');
  });

  it('/boards에서 데일리만 고른다', () => {
    const boards = [
      { boardKey: 'default', mode: null, current: true, startsAt: null, endsAt: null },
      { boardKey: KEY, mode: 'daily' as const, current: true, startsAt: null, endsAt: null },
      { boardKey: 'daily-2026-10-23', mode: 'daily' as const, current: false, startsAt: null, endsAt: null },
    ];
    expect(dailyBoards(boards).map((b) => b.boardKey)).toEqual([KEY, 'daily-2026-10-23']);
    expect(dailyBoards(null)).toEqual([]);
  });

  it('리플레이 공개 — 오늘은 진행 중, 그날 끝 + 2시간 전까지는 곧 공개, 그 뒤 공개 (endsAt 없으면 KST 날짜로)', () => {
    expect(dailyReplayState({ boardKey: KEY, current: true, endsAt: null }, END + 5 * HOUR)).toBe('running');
    expect(dailyReplayState({ boardKey: KEY, current: false, endsAt: null }, END - 1)).toBe('running');
    expect(dailyReplayState({ boardKey: KEY, current: false, endsAt: null }, END + HOUR)).toBe('soon');
    expect(dailyReplayState({ boardKey: KEY, current: false, endsAt: null }, END + 2 * HOUR)).toBe('open');
    expect(dailyReplayState({ boardKey: KEY, current: false, endsAt: new Date(END).toISOString() }, END + 3 * HOUR)).toBe('open');
  });
});

describe('오늘 첫 판 기록·공유 문구', () => {
  beforeEach(() => window.localStorage.clear());

  it('첫 판만 남기고 다시 도전한 판은 덮지 않는다 — 다른 날이면 새로', () => {
    expect(recordDailyRun({ boardKey: KEY, score: 100, lines: 4, level: 1 })).toBe(true);
    expect(recordDailyRun({ boardKey: KEY, score: 900, lines: 40, level: 5 })).toBe(false);
    expect(loadDailyFirstRun(KEY)?.score).toBe(100);
    expect(loadDailyFirstRun('daily-2026-10-25')).toBeNull();
    expect(recordDailyRun({ boardKey: 'daily-2026-10-25', score: 7, lines: 0, level: 1 })).toBe(true);
    expect(loadDailyFirstRun(KEY)).toBeNull();
  });

  it('더 최근 날의 첫 판이 있으면 지난 날 판(자정 직전 세션·다른 탭)이 덮지 않는다', () => {
    recordDailyRun({ boardKey: 'daily-2026-10-25', score: 7, lines: 0, level: 1 });
    expect(recordDailyRun({ boardKey: KEY, score: 100, lines: 4, level: 1 })).toBe(false);
    expect(loadDailyFirstRun('daily-2026-10-25')?.score).toBe(7);
  });

  it('저장값이 데일리 키 형식이 아니면(손상) 비교하지 않고 새 첫 판으로 덮는다 — 첫 판이 영영 막히지 않게', () => {
    window.localStorage.setItem('tetris:daily:first', JSON.stringify({ boardKey: 'zzz', score: 1, lines: 0, level: 1 }));
    expect(recordDailyRun({ boardKey: KEY, score: 100, lines: 4, level: 1 })).toBe(true);
    expect(loadDailyFirstRun(KEY)?.score).toBe(100);
  });

  it('등록하면 순위를 붙인다 — 이미 다른 기록이 붙었으면 무시', () => {
    recordDailyRun({ boardKey: KEY, score: 100, lines: 4, level: 1 });
    attachDailyRank(KEY, 31, 3);
    expect(loadDailyFirstRun(KEY)).toMatchObject({ scoreId: 31, rank: 3 });
    attachDailyRank(KEY, 99, 1);
    expect(loadDailyFirstRun(KEY)).toMatchObject({ scoreId: 31, rank: 3 });
  });

  it('Wordle식 문구 — 날짜·점수·순위(있으면)·줄·레벨·링크', () => {
    expect(dailyShareText({ boardKey: KEY, score: 12340, lines: 40, level: 5, rank: 3 }, 'https://x.test/p')).toBe('오늘의 테트리스 10/24 🟩 12,340점 · 3위\n🧱 40줄 · ⬆️ 레벨 5\nhttps://x.test/p');
    expect(dailyShareText({ boardKey: KEY, score: 10, lines: 1, level: 1 }, 'u')).toBe('오늘의 테트리스 10/24 🟩 10점\n🧱 1줄 · ⬆️ 레벨 1\nu');
  });
});
