// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { RankingsView } from './RankingsView';
import { TEST_GAME } from './testGame';

const getGameRankings = vi.fn();
vi.mock('@/services/gameService', () => ({ getGameRankings: (...a: unknown[]) => getGameRankings(...a) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/games/defense/rankings' }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));

const item = { rank: 1, scoreId: 5, playerName: '수비왕', score: 3_500_000, detail: { wave: 3 }, durationMs: 60_000, createdAt: '2026-10-21T00:00:00Z' };

describe('RankingsView — 게임 사양을 따른다', () => {
  beforeEach(() => {
    getGameRankings.mockReset().mockResolvedValue({ code: 'SUCCESS', message: 'ok', data: { items: [item], periodStart: null } });
    window.localStorage.clear();
  });

  it('제목·뒤로가기·행의 요약·리플레이 링크가 사양에서 온다, 보드를 넘긴다', async () => {
    window.localStorage.setItem('defense:myScoreIds', '[5]');
    await act(async () => {
      render(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />);
    });
    expect(getGameRankings).toHaveBeenCalledWith('defense', 'daily', 50, 'endless-s1');
    expect(screen.getByRole('heading', { name: '타워 디펜스 랭킹' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '← 타워 디펜스' }).getAttribute('href')).toBe('/games/defense');
    expect(screen.getByText(/^웨이브 3 · /)).toBeTruthy();
    expect(screen.getByRole('link', { name: /리플레이 보기/ }).getAttribute('href')).toBe('/games/defense/replays/5');
    expect(screen.getByText('나')).toBeTruthy();
  });

  it('보드 자체가 기간이면(showPeriods=false) 기간 탭을 숨기고 전체 기간으로 부른다', async () => {
    await act(async () => {
      render(<RankingsView game={TEST_GAME} highlightId={null} board="weekly-2026-w43" showPeriods={false} />);
    });
    expect(screen.queryByRole('group', { name: '랭킹 기간' })).toBeNull();
    expect(getGameRankings).toHaveBeenCalledTimes(1);
    expect(getGameRankings).toHaveBeenCalledWith('defense', 'all', 50, 'weekly-2026-w43');
  });

  it('리플레이를 볼 수 없으면 행의 ▶는 이유를 단 비활성 버튼, 머리 영역·빈 목록 시작 링크는 넘긴 대로', async () => {
    await act(async () => {
      render(<RankingsView game={TEST_GAME} highlightId={null} board="weekly-2026-w43" header={<p>보드 탭</p>} replayUnavailable="주가 끝나면 공개돼요" />);
    });
    expect(screen.getByText('보드 탭')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /리플레이 보기/ })).toBeNull();
    const button = screen.getByRole('button', { name: /리플레이 — 주가 끝나면 공개돼요/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
