// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

/** 로그인 상태를 테스트마다 바꾼다 */
const session = vi.hoisted(() => ({ value: { data: null as unknown, status: 'unauthenticated' as string } }));
vi.mock('next-auth/react', () => ({ useSession: () => session.value }));
const getGameRankings = vi.hoisted(() => vi.fn());
const getMyBestScore = vi.hoisted(() => vi.fn());
const submitGameScore = vi.hoisted(() => vi.fn());
vi.mock('@/services/gameService', () => ({ getGameRankings, getMyBestScore, submitGameScore }));
const popularProps = vi.hoisted(() => vi.fn());
vi.mock('@/app/games/_shared/components/PopularReplaysPreview', () => ({
  PopularReplaysPreview: (props: unknown) => {
    popularProps(props);
    return null;
  },
}));
vi.mock('./battle-ui/components/BattleEntry', () => ({ BattleEntry: () => null }));
vi.mock('./battle-ui/components/RecentBattles', () => ({ RecentBattles: () => null }));
vi.mock('./components/DailyCard', () => ({ DailyCard: () => null }));
vi.mock('./components/MySkinCard', () => ({ MySkinCard: () => null }));

import TetrisHome from './TetrisHome';
import { tetrisStorage } from './lib/storage';

const signedIn = () => {
  session.value = { data: { user: { accessToken: 'tok' } }, status: 'authenticated' };
};
const bestText = () => screen.getByText(/내 최고 점수/).textContent;
const row = (scoreId: number, isMine?: boolean) => ({
  rank: 1,
  scoreId,
  playerName: '개발자',
  score: 100,
  detail: { lines: 1, level: 1, pieces: 1, tSpins: 0, tetrises: 0, maxCombo: 0 },
  durationMs: 1000,
  createdAt: '2026-10-26T00:00:00Z',
  ...(isMine === undefined ? {} : { isMine }),
});

describe('TetrisHome — 서버 기준 "나"·내 최고 점수', () => {
  beforeEach(() => {
    localStorage.clear();
    session.value = { data: null, status: 'unauthenticated' };
    getGameRankings.mockReset().mockResolvedValue({ data: { items: [], periodStart: null } });
    getMyBestScore.mockReset();
    submitGameScore.mockReset();
    popularProps.mockReset();
  });

  it('비로그인 — 서버 최고점을 부르지 않고 이 브라우저 최고점, 랭킹·인기 리플레이는 토큰 없이', async () => {
    localStorage.setItem('tetris:bestScore', '1200');
    await act(async () => {
      render(<TetrisHome />);
    });
    expect(getMyBestScore).not.toHaveBeenCalled();
    expect(bestText()).toContain('1,200');
    expect(getGameRankings).toHaveBeenCalledWith('tetris', 'daily', 5, undefined, undefined);
    expect(popularProps).toHaveBeenLastCalledWith(expect.objectContaining({ accessToken: undefined, ready: true }));
  });

  it('로그인 — 계정 최고점(모든 보드)을 우선한다: 이 브라우저 값이 더 커도 서버 값', async () => {
    signedIn();
    localStorage.setItem('tetris:bestScore', '9000');
    getMyBestScore.mockResolvedValue({ data: { score: 4500, scoreId: 7, boardKey: 'default' } });
    await act(async () => {
      render(<TetrisHome />);
    });
    expect(getMyBestScore).toHaveBeenCalledWith('tetris', 'tok');
    expect(bestText()).toContain('4,500');
    expect(getGameRankings).toHaveBeenCalledWith('tetris', 'daily', 5, undefined, 'tok');
    expect(popularProps).toHaveBeenLastCalledWith(expect.objectContaining({ accessToken: 'tok', ready: true }));
  });

  it('로그인인데 서버에 기록이 없거나(null) 불러오지 못하면(배포 전 404 등) 이 브라우저 최고점', async () => {
    signedIn();
    localStorage.setItem('tetris:bestScore', '800');
    getMyBestScore.mockResolvedValueOnce({ data: { score: null, scoreId: null, boardKey: null } });
    const first = render(<TetrisHome />);
    await act(async () => {});
    expect(bestText()).toContain('800');
    first.unmount();

    getMyBestScore.mockRejectedValueOnce(new Error('404'));
    render(<TetrisHome />);
    await act(async () => {});
    expect(bestText()).toContain('800');
  });

  it('로그인 상태가 정해지기 전에는 랭킹·최고점을 부르지 않고 최고점 자리에 "…"', async () => {
    session.value = { data: null, status: 'loading' };
    await act(async () => {
      render(<TetrisHome />);
    });
    expect(getGameRankings).not.toHaveBeenCalled();
    expect(getMyBestScore).not.toHaveBeenCalled();
    expect(popularProps).toHaveBeenLastCalledWith(expect.objectContaining({ ready: false }));
    expect(bestText()).toContain('…');
  });

  it('미리보기의 "나"는 서버 isMine과 이 브라우저 기록의 합집합 — isMine 없는 행(배포 전 응답)은 브라우저 기록일 때만', async () => {
    signedIn();
    getMyBestScore.mockResolvedValue({ data: { score: null, scoreId: null, boardKey: null } });
    localStorage.setItem('tetris:myScoreIds', JSON.stringify([2]));
    getGameRankings.mockResolvedValue({ data: { items: [row(1, true), row(2), row(3, false)], periodStart: null } });
    await act(async () => {
      render(<TetrisHome />);
    });
    const badges = screen.getAllByText('나');
    expect(badges).toHaveLength(2);
  });

  it('보관해 둔 기록을 다시 등록하면 계정 최고점을 다시 받는다', async () => {
    signedIn();
    tetrisStorage.savePendingSubmission({ sessionId: 's1', playerName: '개발자', replay: { frames: 1, inputs: [], seed: 1, das: 10, arr: 2, engineVersion: 1 } as never, score: 9000, savedAt: 1 });
    getMyBestScore.mockResolvedValueOnce({ data: { score: 4500, scoreId: 7, boardKey: 'default' } }).mockResolvedValueOnce({ data: { score: 9000, scoreId: 8, boardKey: 'default' } });
    submitGameScore.mockResolvedValue({ data: { scoreId: 8, score: 9000, detail: {}, ranks: null, playerName: '개발자' } });
    await act(async () => {
      render(<TetrisHome />);
    });
    expect(bestText()).toContain('4,500');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '다시 등록하기' }));
    });
    expect(getMyBestScore).toHaveBeenCalledTimes(2);
    expect(bestText()).toContain('9,000');
  });
});
