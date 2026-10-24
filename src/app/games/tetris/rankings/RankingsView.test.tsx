// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import TetrisRankingsView from './RankingsView';

const getGameBoards = vi.fn();
const getGameRankings = vi.fn();
vi.mock('@/services/gameService', () => ({
  getGameBoards: (...a: unknown[]) => getGameBoards(...a),
  getGameRankings: (...a: unknown[]) => getGameRankings(...a),
  getGameScore: vi.fn(),
  getPopularReplays: vi.fn(),
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
    getGameBoards.mockReset().mockResolvedValue({ data: { items: boards } });
    getGameRankings.mockReset().mockResolvedValue({ data: { items: [item], periodStart: null } });
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
});
