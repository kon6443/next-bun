// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import TetrisRankingsView from './RankingsView';
import { resetRankingsCache } from '@/app/games/_shared/components/RankingsView';
import RankingsPage from './page';

const getGameBoards = vi.fn();
const getGameRankings = vi.fn();
const getGameScore = vi.fn();
vi.mock('@/services/gameService', () => ({
  getGameBoards: (...a: unknown[]) => getGameBoards(...a),
  getGameRankings: (...a: unknown[]) => getGameRankings(...a),
  getGameScore: (...a: unknown[]) => getGameScore(...a),
  getPopularReplays: vi.fn(),
  getHallOfFame: () => Promise.resolve({ data: { periods: [] } }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/games/tetris/rankings' }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));

const item = { rank: 1, scoreId: 5, playerName: '테트왕', score: 900, detail: { lines: 10, level: 2 }, durationMs: 60_000, createdAt: '2026-10-24T00:00:00Z' };
const boards = [
  { boardKey: 'default', mode: null, current: true, startsAt: null, endsAt: null },
  { boardKey: 'daily-2026-10-24', mode: 'daily', current: true, startsAt: null, endsAt: null },
  { boardKey: 'daily-2026-10-23', mode: 'daily', current: false, startsAt: null, endsAt: '2026-10-23T15:00:00Z' },
];

describe('테트리스 랭킹 — 오늘의 테트리스 보드 탭 (games-growth B1)', () => {
  beforeEach(() => {
    resetRankingsCache();
    getGameBoards.mockReset().mockResolvedValue({ data: { items: boards } });
    getGameRankings.mockReset().mockResolvedValue({ data: { items: [item], periodStart: null } });
    getGameScore.mockReset();
  });

  it('보드 지정 없이는 기본 랭킹(보드 없이·기간 탭), 데일리 보드가 있으면 탭을 보인다', async () => {
    await act(async () => {
      render(<TetrisRankingsView highlightId={null} boardParam={null} />);
    });
    expect(getGameRankings).toHaveBeenCalledWith('tetris', 'daily', 50, undefined);
    expect(screen.getByRole('group', { name: '랭킹 기간' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '오늘의 테트리스 10/24' }).getAttribute('href')).toBe('/games/tetris/rankings?board=daily-2026-10-24');
    expect(screen.getByRole('link', { name: '10/23 데일리' })).toBeTruthy();
  });

  it('daily 별칭은 오늘 보드로 — 기간 탭 없이, 오늘 리플레이는 비공개(▶ 비활성), 빈 목록 시작은 데일리 플레이', async () => {
    await act(async () => {
      render(<TetrisRankingsView highlightId={null} boardParam="daily" />);
    });
    expect(getGameRankings).toHaveBeenCalledWith('tetris', 'all', 50, 'daily-2026-10-24');
    expect(screen.queryByRole('group', { name: '랭킹 기간' })).toBeNull();
    expect(screen.getByRole('link', { name: '오늘의 테트리스 10/24' }).getAttribute('aria-current')).toBe('page');
    const replay = screen.getByRole('button', { name: /리플레이 — 하루가 끝나고 2시간 뒤 공개돼요/ }) as HTMLButtonElement;
    expect(replay.disabled).toBe(true);
    // 리플레이가 없는 보드는 조회·시청 정렬도 숨긴다
    expect(screen.queryByRole('group', { name: '랭킹 정렬' })).toBeNull();
  });

  it('지난 데일리는 그날 끝 + 2시간이 지났으면 ▶ 링크', async () => {
    await act(async () => {
      render(<TetrisRankingsView highlightId={null} boardParam="daily-2026-10-23" />);
    });
    expect(getGameRankings).toHaveBeenCalledWith('tetris', 'all', 50, 'daily-2026-10-23');
    expect(screen.getByRole('link', { name: /리플레이 보기/ }).getAttribute('href')).toBe('/games/tetris/replays/5');
  });

  it('데일리 보드가 없으면(서버 비밀값 없음) 탭 없이 기본 랭킹만', async () => {
    getGameBoards.mockResolvedValue({ data: { items: [boards[0]] } });
    await act(async () => {
      render(<TetrisRankingsView highlightId={null} boardParam={null} />);
    });
    expect(screen.queryByTestId('tetris-board-tabs')).toBeNull();
  });

  it('도전장 보드(challenge-{원본}) — 기간 탭 없이 그 보드로, 머리에 원본 기록과 직접 도전 (games-growth B2)', async () => {
    getGameScore.mockResolvedValue({ data: { ...item, scoreId: 7, playerName: '원본왕', score: 12340 } });
    await act(async () => {
      render(<TetrisRankingsView highlightId={50} boardParam="challenge-7" />);
    });
    expect(getGameRankings).toHaveBeenCalledWith('tetris', 'all', 50, 'challenge-7');
    expect(screen.queryByRole('group', { name: '랭킹 기간' })).toBeNull();
    expect(getGameScore).toHaveBeenCalledWith('tetris', 7);
    expect(screen.getByTestId('challenge-board').textContent).toContain('원본왕님의 12,340점에 도전한 기록이에요.');
    expect(screen.getByRole('link', { name: '직접 도전' }).getAttribute('href')).toBe('/games/tetris/challenge/7');
  });

  it('page: ?board= 는 daily·daily-날짜·challenge-{id}만 넘긴다 — 도전장 결과의 "랭킹 보기"가 도전장 보드로 (games-growth B2)', async () => {
    const boardOf = async (board: string) => ((await RankingsPage({ searchParams: Promise.resolve({ board }) })) as { props: { boardParam: string | null } }).props.boardParam;
    expect(await boardOf('challenge-7')).toBe('challenge-7');
    expect(await boardOf('daily')).toBe('daily');
    expect(await boardOf('daily-2026-10-24')).toBe('daily-2026-10-24');
    expect(await boardOf('challenge-0')).toBeNull();
    expect(await boardOf('weekly-2026-w43')).toBeNull();
  });

  it('다른 도전장 보드로 바뀌면 새 원본이 오기 전까지 이전 원본을 보이지 않는다', async () => {
    getGameScore.mockResolvedValueOnce({ data: { ...item, scoreId: 7, playerName: '원본왕', score: 12340 } }).mockReturnValueOnce(new Promise(() => {}));
    const { rerender } = await act(async () => render(<TetrisRankingsView highlightId={null} boardParam="challenge-7" />));
    expect(screen.getByTestId('challenge-board').textContent).toContain('원본왕님');
    await act(async () => {
      rerender(<TetrisRankingsView highlightId={null} boardParam="challenge-9" />);
    });
    expect(getGameScore).toHaveBeenLastCalledWith('tetris', 9);
    expect(screen.getByTestId('challenge-board').textContent).toContain('같은 블록 순서로 겨룬 도전장 기록이에요.');
  });

  it('지난 데일리가 공개 전이면 안내에 그날 날짜', async () => {
    const yesterday = { boardKey: 'daily-2026-10-23', mode: 'daily', current: false, startsAt: null, endsAt: new Date(Date.now() - 60_000).toISOString() };
    getGameBoards.mockResolvedValue({ data: { items: [boards[0], yesterday] } });
    await act(async () => {
      render(<TetrisRankingsView highlightId={null} boardParam="daily-2026-10-23" />);
    });
    expect(screen.getByText('10/23 데일리 리플레이는 하루가 끝나고 2시간 뒤 공개돼요.')).toBeTruthy();
  });
});
