// @vitest-environment jsdom
import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RANKINGS_CACHE_MS, RANKINGS_DEBOUNCE_MS, RankingsView, invalidateRankings, resetRankingsCache } from './RankingsView';
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

/** 디바운스만큼 시간을 보내고 응답까지 받는다(가짜 타이머 — 부하에 따라 흔들리지 않게) */
const passDebounce = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(RANKINGS_DEBOUNCE_MS);
  });
};
/** 탭을 누르고 디바운스가 지나 응답까지 받는다 */
const clickTab = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
  await passDebounce();
};

const item = { rank: 1, scoreId: 5, playerName: '수비왕', score: 3_500_000, detail: { wave: 3 }, durationMs: 60_000, createdAt: '2026-10-21T00:00:00Z' };

describe('RankingsView — 게임 사양을 따른다', () => {
  beforeEach(() => {
    getGameRankings.mockReset().mockResolvedValue({ code: 'SUCCESS', message: 'ok', data: { items: [item], periodStart: null } });
    getGameScore.mockReset();
    getPopularReplays.mockReset();
    window.localStorage.clear();
    resetRankingsCache();
    // 디바운스 타이머만 가짜로 — 서비스 응답(마이크로태스크)은 그대로
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
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
    // 받아 둔 목록에 가리킨 기록이 없으면 다시 받는다(방금 등록한 기록일 수 있다) — 그래도 없으면 순위를 따로 받는다
    await passDebounce();
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
    await clickTab('주간');
    await clickTab('조회순');
    expect(getPopularReplays).toHaveBeenLastCalledWith('defense', { period: 'weekly', sort: 'views', limit: 50, board: 'endless-s1' });
    expect(screen.getByText('· 조회 31')).toBeTruthy();
    // 인기 순서는 점수 순위가 아니다 — 읽는 이름도 "인기 N번째"
    expect(screen.getByRole('link', { name: '수비왕 인기 1번째 리플레이 보기' }).getAttribute('href')).toBe('/games/defense/replays/77');
    // 인기 목록은 메달 없이 순서 숫자만 — 점수 순위와 헷갈리지 않게
    expect(screen.queryByText('🥇')).toBeNull();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.queryByTestId('ranking-outside')).toBeNull();
    expect(getGameScore).not.toHaveBeenCalled();

    await clickTab('시청순');
    expect(getPopularReplays).toHaveBeenLastCalledWith('defense', { period: 'weekly', sort: 'watch', limit: 50, board: 'endless-s1' });
    expect(screen.getByText('· 시청 12분')).toBeTruthy();

    getPopularReplays.mockResolvedValue({ code: 'SUCCESS', message: 'ok', data: { boardKey: 'endless-s1', period: 'all', sort: 'watch', periodStart: null, items: [] } });
    await clickTab('전체');
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
    await clickTab('조회순');
    await clickTab('시청순');
    expect(screen.getByText('· 시청 2분')).toBeTruthy();
    await act(async () => {
      resolveViews(popular('views', 0));
    });
    expect(screen.getByText('· 시청 2분')).toBeTruthy();
    expect(screen.queryByText('· 조회 99')).toBeNull();
  });

  it('입상 기록(trophies)이 있으면 이름 옆에 배지 — 없으면(null) 없음 (games-growth B5)', async () => {
    getGameRankings.mockResolvedValue({ code: 'SUCCESS', message: 'ok', data: { items: [{ ...item, trophies: { gold: 2, silver: 1, bronze: 0 } }, { ...item, scoreId: 6, rank: 2, trophies: null }], periodStart: null } });
    await act(async () => {
      render(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />);
    });
    expect(screen.getAllByTestId('trophy-badge')).toHaveLength(1);
    expect(screen.getByRole('img', { name: '명예의 전당 1위 2회·2위 1회' })).toBeTruthy();
  });

  it('탭 결과는 잠시 다시 쓴다 — 오간 탭은 다시 부르지 않고, 빠르게 지나간 탭은 부르지 않는다(요청 한도 429, UX 점검)', async () => {
    let now = 1_000_000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    await act(async () => {
      render(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />);
    });
    expect(getGameRankings).toHaveBeenCalledTimes(1);
    // 주간 → 전체를 디바운스 안에 연달아 — 마지막(전체)만 부른다
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '주간' }));
      fireEvent.click(screen.getByRole('button', { name: '전체' }));
    });
    await passDebounce();
    expect(getGameRankings.mock.calls.map((call) => call[1])).toEqual(['daily', 'all']);
    // 일간으로 돌아오면 받아 둔 목록 — 부르지 않고 바로 보인다
    await clickTab('일간');
    expect(getGameRankings).toHaveBeenCalledTimes(2);
    expect(screen.getByText('수비왕')).toBeTruthy();
    // 오래되면 다시 부른다
    now += RANKINGS_CACHE_MS;
    await clickTab('전체');
    expect(getGameRankings).toHaveBeenCalledTimes(3);
    clock.mockRestore();
  });

  it('보드 탭을 바꿔 화면을 새로 그려도 — 받아 둔 보드는 다시 부르지 않고, 연달아 바꾼 새 보드는 잠깐 기다렸다 부른다', async () => {
    const first = await act(async () => render(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />));
    expect(getGameRankings).toHaveBeenCalledTimes(1);
    first.unmount();
    const second = await act(async () => render(<RankingsView game={TEST_GAME} highlightId={null} board="weekly-2026-w43" showPeriods={false} />));
    expect(getGameRankings).toHaveBeenCalledTimes(1);
    await passDebounce();
    expect(getGameRankings).toHaveBeenLastCalledWith('defense', 'all', 50, 'weekly-2026-w43');
    second.unmount();
    await act(async () => {
      render(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />);
    });
    expect(getGameRankings).toHaveBeenCalledTimes(2);
    expect(screen.getByText('수비왕')).toBeTruthy();
  });

  it('방금 등록한 기록을 가리키면 받아 둔 목록을 쓰지 않는다 — "상위 50위 밖" 오안내 없이 내 행 강조 (리뷰)', async () => {
    const first = await act(async () => render(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />));
    expect(getGameRankings).toHaveBeenCalledTimes(1);
    first.unmount();
    // 그사이 새 기록(9)이 1위로 등록됐다
    getGameRankings.mockResolvedValue({ code: 'SUCCESS', message: 'ok', data: { items: [{ ...item, scoreId: 9 }, { ...item, scoreId: 5, rank: 2 }], periodStart: null } });
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + RANKINGS_DEBOUNCE_MS);
    await act(async () => {
      render(<RankingsView game={TEST_GAME} highlightId={9} board="endless-s1" />);
    });
    expect(getGameRankings).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('ranking-outside')).toBeNull();
    expect(getGameScore).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('기록을 등록하면(invalidateRankings) 그 게임의 받아 둔 목록을 버린다 — 다른 게임 것은 그대로', async () => {
    const first = await act(async () => render(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />));
    first.unmount();
    invalidateRankings('tetris');
    await passDebounce();
    const second = await act(async () => render(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />));
    expect(getGameRankings).toHaveBeenCalledTimes(1);
    second.unmount();
    invalidateRankings('defense');
    await act(async () => {
      render(<RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />);
    });
    await passDebounce();
    expect(getGameRankings).toHaveBeenCalledTimes(2);
  });

  it('StrictMode(effect 두 번)에서도 첫 목록은 한 번만 부른다', async () => {
    await act(async () => {
      render(
        <StrictMode>
          <RankingsView game={TEST_GAME} highlightId={null} board="endless-s1" />
        </StrictMode>,
      );
    });
    await passDebounce();
    expect(getGameRankings).toHaveBeenCalledTimes(1);
    expect(screen.getByText('수비왕')).toBeTruthy();
  });
});
