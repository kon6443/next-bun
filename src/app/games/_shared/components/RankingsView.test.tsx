// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RankingsView } from './RankingsView';
import { TEST_GAME } from './testGame';

const getGameRankings = vi.fn();
const getGameScore = vi.fn();
const getPopularReplays = vi.fn();
vi.mock('@/services/gameService', () => ({
  getGameRankings: (...a: unknown[]) => getGameRankings(...a),
  getGameScore: (...a: unknown[]) => getGameScore(...a),
  getPopularReplays: (...a: unknown[]) => getPopularReplays(...a),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/games/defense/rankings' }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));

const item = { rank: 1, scoreId: 5, playerName: '수비왕', score: 3_500_000, detail: { wave: 3 }, durationMs: 60_000, createdAt: '2026-10-21T00:00:00Z' };

describe('RankingsView — 게임 사양을 따른다', () => {
  beforeEach(() => {
    getGameRankings.mockReset().mockResolvedValue({ code: 'SUCCESS', message: 'ok', data: { items: [item], periodStart: null } });
    getGameScore.mockReset();
    getPopularReplays.mockReset();
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

  it('가리킨 기록이 목록에 있으면 그 행으로 스크롤 — 없으면 전체 기간 순위를 받아 "상위 50위 밖"을 알린다 (games-polish FE-14)', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { unmount } = await act(async () => render(<RankingsView game={TEST_GAME} highlightId={5} board="endless-s1" />));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(screen.queryByTestId('ranking-outside')).toBeNull();
    expect(getGameScore).not.toHaveBeenCalled();
    unmount();

    getGameScore.mockResolvedValue({ data: { ...item, scoreId: 99, rank: 137 } });
    await act(async () => {
      render(<RankingsView game={TEST_GAME} highlightId={99} board="endless-s1" />);
    });
    expect(getGameScore).toHaveBeenCalledWith('defense', 99);
    expect(screen.getByTestId('ranking-outside').textContent).toBe('가리킨 기록은 이 목록(상위 50위)에 없어요 · 전체 기간 137위');
  });

  it('점수순 행 보조줄 끝에 누적 조회수 — 응답에 없으면 0', async () => {
    getGameRankings.mockResolvedValue({ code: 'SUCCESS', message: 'ok', data: { items: [item, { ...item, scoreId: 6, rank: 2, viewCount: 1234 }], periodStart: null } });
    await act(async () => {
      render(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />);
    });
    expect(screen.getByText('· 조회 0')).toBeTruthy();
    expect(screen.getByText('· 조회 1,234')).toBeTruthy();
  });

  it('조회순·시청순은 인기 리플레이를 같은 기간·보드로 부르고 기간 지표를 보인다, "상위 50위 밖" 안내는 하지 않는다', async () => {
    const popular = { ...item, scoreId: 77, viewCount: 900, periodViewCount: 31, periodWatchMs: 12 * 60_000 + 5_000 };
    getPopularReplays.mockResolvedValue({ code: 'SUCCESS', message: 'ok', data: { boardKey: 'endless-s1', period: 'weekly', sort: 'views', periodStart: null, items: [popular] } });
    await act(async () => {
      render(<RankingsView game={TEST_GAME} highlightId={5} board="endless-s1" />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '주간' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '조회순' }));
    });
    expect(getPopularReplays).toHaveBeenLastCalledWith('defense', { period: 'weekly', sort: 'views', limit: 50, board: 'endless-s1' });
    expect(screen.getByText('· 조회 31')).toBeTruthy();
    // 인기 순서는 점수 순위가 아니다 — 읽는 이름도 "인기 N번째"
    expect(screen.getByRole('link', { name: '수비왕 인기 1번째 리플레이 보기' }).getAttribute('href')).toBe('/games/defense/replays/77');
    // 인기 목록은 메달 없이 순서 숫자만 — 점수 순위와 헷갈리지 않게
    expect(screen.queryByText('🥇')).toBeNull();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.queryByTestId('ranking-outside')).toBeNull();
    expect(getGameScore).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시청순' }));
    });
    expect(getPopularReplays).toHaveBeenLastCalledWith('defense', { period: 'weekly', sort: 'watch', limit: 50, board: 'endless-s1' });
    expect(screen.getByText('· 시청 12분')).toBeTruthy();

    getPopularReplays.mockResolvedValue({ code: 'SUCCESS', message: 'ok', data: { boardKey: 'endless-s1', period: 'weekly', sort: 'watch', periodStart: null, items: [] } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '조회순' }));
    });
    expect(screen.getByText('이 기간에 본 리플레이가 아직 없어요.')).toBeTruthy();
  });

  it('리플레이를 아직 볼 수 없는 보드(진행 중인 주간)는 정렬을 숨긴다', async () => {
    await act(async () => {
      render(<RankingsView game={TEST_GAME} highlightId={null} board="weekly-2026-w43" showPeriods={false} replayUnavailable="주가 끝나면 공개돼요" />);
    });
    expect(screen.queryByRole('group', { name: '랭킹 정렬' })).toBeNull();
    expect(getPopularReplays).not.toHaveBeenCalled();
  });

  it('정렬을 빠르게 바꾸면 늦게 온 이전 정렬 응답은 버린다', async () => {
    let resolveViews!: (value: unknown) => void;
    const popular = (sort: 'views' | 'watch', periodWatchMs: number) => ({
      code: 'SUCCESS',
      message: 'ok',
      data: { boardKey: 'endless-s1', period: 'daily', sort, periodStart: null, items: [{ ...item, periodViewCount: 99, periodWatchMs }] },
    });
    getPopularReplays.mockImplementation((_game: string, query: { sort: string }) =>
      query.sort === 'views' ? new Promise((resolve) => (resolveViews = resolve)) : Promise.resolve(popular('watch', 120_000)),
    );
    await act(async () => {
      render(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '조회순' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시청순' }));
    });
    expect(screen.getByText('· 시청 2분')).toBeTruthy();
    await act(async () => {
      resolveViews(popular('views', 0));
    });
    expect(screen.getByText('· 시청 2분')).toBeTruthy();
    expect(screen.queryByText('· 조회 99')).toBeNull();
  });
});
