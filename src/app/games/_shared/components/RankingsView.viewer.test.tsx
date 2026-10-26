// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RANKINGS_DEBOUNCE_MS, RankingsView, resetRankingsCache } from './RankingsView';
import { TEST_GAME } from './testGame';

/** 로그인 상태를 테스트 안에서 바꾼다 */
const session = vi.hoisted(() => ({ value: { data: null as unknown, status: 'unauthenticated' as string } }));
vi.mock('next-auth/react', () => ({ useSession: () => session.value }));
const getGameRankings = vi.fn();
const getGameScore = vi.fn();
const getPopularReplays = vi.fn();
vi.mock('@/services/gameService', () => ({
  getGameRankings: (...a: unknown[]) => getGameRankings(...a),
  getGameScore: (...a: unknown[]) => getGameScore(...a),
  getPopularReplays: (...a: unknown[]) => getPopularReplays(...a),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/games/defense/rankings' }));

const item = (scoreId: number, isMine?: boolean) => ({
  rank: 1,
  scoreId,
  playerName: '수비왕',
  score: 100,
  detail: { wave: 3 },
  durationMs: 60_000,
  createdAt: '2026-10-21T00:00:00Z',
  ...(isMine === undefined ? {} : { isMine }),
});
const listing = (...items: ReturnType<typeof item>[]) => ({ code: 'SUCCESS', message: 'ok', data: { items, periodStart: null } });
const signedIn = (token = 'tok', userId = 1) => {
  session.value = { data: { user: { accessToken: token, userId } }, status: 'authenticated' };
};

describe('RankingsView — 로그인이면 서버 기준 "나"(isMine)', () => {
  beforeEach(() => {
    session.value = { data: null, status: 'unauthenticated' };
    getGameRankings.mockReset();
    getGameScore.mockReset();
    getPopularReplays.mockReset();
    window.localStorage.clear();
    resetRankingsCache();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('로그인이면 점수순·조회순 모두 토큰을 실어 부르고, 서버가 표시한 내 기록에 "나" — 이 브라우저 기록과 합친다', async () => {
    signedIn();
    window.localStorage.setItem('defense:myScoreIds', '[2]');
    getGameRankings.mockResolvedValue(listing(item(1, true), item(2), item(3, false)));
    getPopularReplays.mockResolvedValue({ code: 'SUCCESS', message: 'ok', data: { items: [{ ...item(4, true), periodViewCount: 1, periodWatchMs: 0 }] } });
    await act(async () => {
      render(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />);
    });
    expect(getGameRankings).toHaveBeenCalledWith('defense', 'daily', 50, 'endless-s1', 'tok');
    expect(screen.getAllByText('나')).toHaveLength(2);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '조회순' }));
      await vi.advanceTimersByTimeAsync(RANKINGS_DEBOUNCE_MS);
    });
    expect(getPopularReplays).toHaveBeenLastCalledWith('defense', { period: 'daily', sort: 'views', limit: 50, board: 'endless-s1' }, 'tok');
    expect(screen.getAllByText('나')).toHaveLength(1);
  });

  it('로그인 상태가 정해지기 전에는 부르지 않는다 — 익명으로 한 번, 토큰으로 또 한 번 부르지 않게', async () => {
    session.value = { data: null, status: 'loading' };
    getGameRankings.mockResolvedValue(listing(item(1)));
    const view = render(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />);
    await act(async () => {});
    expect(getGameRankings).not.toHaveBeenCalled();
    signedIn();
    await act(async () => {
      view.rerender(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />);
    });
    expect(getGameRankings).toHaveBeenCalledTimes(1);
    expect(getGameRankings).toHaveBeenCalledWith('defense', 'daily', 50, 'endless-s1', 'tok');
  });

  it('받아 둔 목록은 보는 사람별 — 비로그인으로 받은 목록(isMine 없음)을 로그인 뒤에 다시 쓰지 않는다', async () => {
    getGameRankings.mockResolvedValueOnce(listing(item(1, false)));
    const guest = render(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />);
    await act(async () => {});
    expect(screen.queryByText('나')).toBeNull();
    guest.unmount();

    signedIn();
    getGameRankings.mockResolvedValueOnce(listing(item(1, true)));
    render(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RANKINGS_DEBOUNCE_MS);
    });
    expect(getGameRankings).toHaveBeenCalledTimes(2);
    expect(getGameRankings).toHaveBeenLastCalledWith('defense', 'daily', 50, 'endless-s1', 'tok');
    expect(screen.getByText('나')).toBeTruthy();
  });

  it('화면이 떠 있는 채로 로그아웃하면 토큰 없이 다시 받아 서버가 표시했던 "나"가 사라진다', async () => {
    signedIn();
    getGameRankings.mockResolvedValueOnce(listing(item(1, true)));
    const view = render(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />);
    await act(async () => {});
    expect(screen.getByText('나')).toBeTruthy();

    session.value = { data: null, status: 'unauthenticated' };
    getGameRankings.mockResolvedValueOnce(listing(item(1, false)));
    await act(async () => {
      view.rerender(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />);
    });
    // 방금 불렀으므로 디바운스만큼 기다렸다 부른다
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RANKINGS_DEBOUNCE_MS);
    });
    expect(getGameRankings).toHaveBeenLastCalledWith('defense', 'daily', 50, 'endless-s1', undefined);
    expect(screen.queryByText('나')).toBeNull();
  });

  it('로그인 확인 뒤 비로그인으로 정해지면 토큰 없이 한 번만 부른다', async () => {
    session.value = { data: null, status: 'loading' };
    getGameRankings.mockResolvedValue(listing(item(1)));
    const view = render(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />);
    await act(async () => {});
    session.value = { data: null, status: 'unauthenticated' };
    await act(async () => {
      view.rerender(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />);
    });
    expect(getGameRankings).toHaveBeenCalledTimes(1);
    expect(getGameRankings).toHaveBeenCalledWith('defense', 'daily', 50, 'endless-s1', undefined);
  });

  it('같은 사람이면 토큰 문자열이 바뀌어도 받아 둔 목록을 다시 쓴다 — 캐시 키는 계정(토큰 원문이 아니다)', async () => {
    signedIn('tok-a', 1);
    getGameRankings.mockResolvedValue(listing(item(1, true)));
    const first = render(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />);
    await act(async () => {});
    first.unmount();
    signedIn('tok-b', 1);
    render(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />);
    await act(async () => {});
    // 받아 둔 목록이 없다면 디바운스 뒤에 부를 것이다 — 그만큼 기다려도 부르지 않는다
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RANKINGS_DEBOUNCE_MS);
    });
    expect(getGameRankings).toHaveBeenCalledTimes(1);
    expect(screen.getByText('나')).toBeTruthy();
  });
});
