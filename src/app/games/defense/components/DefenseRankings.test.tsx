// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { DefenseRankings } from './DefenseRankings';
import { weeklyBoardKeyAt } from '../lib/rankedBoards';
import { RankedCards } from './RankedCards';

const getGameBoards = vi.hoisted(() => vi.fn());
const getGameRankings = vi.hoisted(() => vi.fn());
vi.mock('@/services/gameService', () => ({ getGameBoards, getGameRankings }));
// next/link 전용 속성(replace·scroll)은 <a>에 넘기지 않는다
const linkAttrs = (rest: Record<string, unknown>) => Object.fromEntries(Object.entries(rest).filter(([key]) => key !== 'replace' && key !== 'scroll'));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...linkAttrs(rest)}>{children}</a> }));

const BOARDS = {
  code: 'SUCCESS',
  message: '',
  data: {
    items: [
      { boardKey: 'endless-s1', mode: 'endless', current: true, startsAt: null, endsAt: null },
      { boardKey: 'weekly-2026-w43', mode: 'weekly', current: true, startsAt: '2026-10-18T15:00:00Z', endsAt: '2099-10-25T15:00:00Z' },
      { boardKey: 'weekly-2026-w42', mode: 'weekly', current: false, startsAt: '2026-10-11T15:00:00Z', endsAt: '2026-10-18T15:00:00Z' },
    ],
  },
};
const item = { rank: 1, scoreId: 5, playerName: '수비왕', score: 24_500_000, detail: { wave: 24, kills: 800 }, durationMs: 60_000, createdAt: '2026-10-21T00:00:00Z' };

describe('디펜스 랭킹·허브 카드', () => {
  beforeEach(() => {
    localStorage.clear();
    getGameBoards.mockReset().mockResolvedValue(BOARDS);
    getGameRankings.mockReset().mockResolvedValue({ code: 'SUCCESS', message: '', data: { boardKey: 'x', items: [item], periodStart: null } });
  });

  it('?board=weekly → 이번 주 보드, 기간 탭 없음, 리플레이는 주 종료 4시간 뒤 공개', async () => {
    await act(async () => {
      render(<DefenseRankings boardParam="weekly" highlightId={null} />);
    });
    expect(getGameRankings).toHaveBeenCalledWith('defense', 'all', 50, 'weekly-2026-w43');
    expect(screen.getByTestId('defense-board-tab-weekly-2026-w43').getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('group', { name: '랭킹 기간' })).toBeNull();
    expect(screen.getByRole('button', { name: /주가 끝나고 4시간 뒤 공개돼요/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /리플레이 보기/ })).toBeNull();
  });

  it('막 끝난 주(종료 4시간 안)는 ▶ 비활성 "곧 공개돼요" — D-032', async () => {
    getGameBoards.mockResolvedValue({ ...BOARDS, data: { items: [BOARDS.data.items[0], { ...BOARDS.data.items[2], endsAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() }] } });
    await act(async () => {
      render(<DefenseRankings boardParam="weekly-2026-w42" highlightId={null} />);
    });
    expect(screen.getByRole('button', { name: /곧 공개돼요\(주 종료 4시간 뒤\)/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /리플레이 보기/ })).toBeNull();
  });

  it('지난 주 보드는 리플레이 링크', async () => {
    await act(async () => {
      render(<DefenseRankings boardParam="weekly-2026-w42" highlightId={null} />);
    });
    expect(screen.getByRole('link', { name: /리플레이 보기/ }).getAttribute('href')).toBe('/games/defense/replays/5');
  });

  it('무한 기본 — 기간 탭(일간부터), 행 ▶는 리플레이 링크', async () => {
    await act(async () => {
      render(<DefenseRankings boardParam={null} highlightId={null} />);
    });
    expect(getGameRankings).toHaveBeenCalledWith('defense', 'daily', 50, 'endless-s1');
    expect(screen.getByRole('group', { name: '랭킹 기간' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /리플레이 보기/ }).getAttribute('href')).toBe('/games/defense/replays/5');
    expect(screen.getByText(/^처치 800 · 1:00 · /)).toBeTruthy();
    // 점수 칸은 원점수 대신 "웨이브 n · 진척 p%"(사용자 결정) — 정렬은 서버 점수 그대로
    expect(screen.getByText('웨이브 24 · 진척 50%')).toBeTruthy();
    expect(screen.queryByText('24,500,000')).toBeNull();
    expect(screen.getByTestId('defense-board-tab-weekly-2026-w42').getAttribute('href')).toBe('/games/defense/rankings?board=weekly-2026-w42');
  });

  it('보드 목록을 못 받으면 무한 랭킹만 + 안내', async () => {
    getGameBoards.mockRejectedValue(new Error('x'));
    await act(async () => {
      render(<DefenseRankings boardParam="weekly" highlightId={null} />);
    });
    expect(getGameRankings).toHaveBeenCalledWith('defense', 'daily', 50, 'endless-s1');
    expect(screen.getByText(/무한 모드 랭킹만/)).toBeTruthy();
  });

  it('보드 목록이 없어도 이번 주 키로 들어오면 진행 중인 주로 본다(리플레이 비공개)', async () => {
    getGameBoards.mockRejectedValue(new Error('x'));
    await act(async () => {
      render(<DefenseRankings boardParam={weeklyBoardKeyAt(Date.now())} highlightId={null} />);
    });
    expect(screen.getByRole('button', { name: /주가 끝나고 4시간 뒤 공개돼요/ })).toBeTruthy();
  });

  it('허브 카드 — 스테이지 4 전에는 잠김(랭킹은 열림), 깬 뒤에는 시작·이번 주 W43·내 최고 웨이브', async () => {
    const { unmount } = render(<RankedCards />);
    expect(await screen.findByTestId('defense-endless-locked')).toBeTruthy();
    expect(screen.getByTestId('defense-weekly-rankings').getAttribute('href')).toBe('/games/defense/rankings?board=weekly');
    unmount();
    localStorage.setItem('defense:progress', JSON.stringify({ v: 1, stars: { s4: { normal: 2 } } }));
    localStorage.setItem('defense:best', JSON.stringify({ v: 1, boards: { 'endless-s1': 24_500_000 } }));
    await act(async () => {
      render(<RankedCards />);
    });
    expect(screen.getByTestId('defense-endless-play').getAttribute('href')).toBe('/games/defense/play/endless');
    expect(screen.getByTestId('defense-weekly-play').getAttribute('href')).toBe('/games/defense/play/weekly');
    expect(screen.getByText(/W43 · \d+일/)).toBeTruthy();
    expect(screen.getByText('내 최고 웨이브 24 · 진척 50%')).toBeTruthy();
  });

  it('허브 카드 — /boards에 이번 주가 없으면(서버 설정) 주간 시작을 막는다', async () => {
    localStorage.setItem('defense:progress', JSON.stringify({ v: 1, stars: { s4: { normal: 1 } } }));
    getGameBoards.mockResolvedValue({ ...BOARDS, data: { items: [BOARDS.data.items[0]] } });
    await act(async () => {
      render(<RankedCards />);
    });
    expect(screen.getByText('이번 주 도전을 열 수 없어요')).toBeTruthy();
    expect(screen.queryByTestId('defense-weekly-play')).toBeNull();
  });
});
