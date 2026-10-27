// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ value: { data: null as unknown, status: 'unauthenticated' } }));
vi.mock('next-auth/react', () => ({ useSession: () => session.value }));
const getPointHistory = vi.hoisted(() => vi.fn());
vi.mock('@/services/userService', () => ({ getPointHistory }));
const startLogin = vi.hoisted(() => vi.fn());
vi.mock('@/app/auth/useKakaoLogin', () => ({ useKakaoLogin: () => ({ start: startLogin, isStarting: false }) }));

import { ApiError } from '@/types/api';
import PointsHistoryView, { describePointItem, formatSignedPoints } from './PointsHistoryView';

const points = { balance: 2_500_000, earned: 3_500_000, spent: 1_000_000 };
const at = (daysAgo: number, hh = 12) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hh, 5, 0, 0);
  return d.toISOString();
};
const score = (id: number, amount: number, daysAgo: number, scoreId = 100 + id) => ({
  id,
  amount,
  reason: 'TETRIS_SCORE',
  refKey: String(scoreId),
  meta: { scoreId },
  memo: null,
  createdAt: at(daysAgo),
});
const upgrade = (id: number, daysAgo: number) => ({
  id,
  amount: -100_000,
  reason: 'SKIN_UPGRADE',
  refKey: 'block:chocolate:2',
  meta: { slot: 'block', skinId: 'chocolate', level: 2 },
  memo: 'block chocolate Lv2',
  createdAt: at(daysAgo, 9),
});
const page = (items: unknown[], nextCursor: number | null = null) => ({ code: 'SUCCESS', message: '', data: { points, items, nextCursor } });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

const login = () => {
  session.value = { data: { user: { accessToken: 'tok' } }, status: 'authenticated' };
};

beforeEach(() => {
  getPointHistory.mockReset();
  startLogin.mockReset();
});
afterEach(() => {
  session.value = { data: null, status: 'unauthenticated' };
});

describe('포인트 내역 (tetris-home A)', () => {
  it('게스트 — 부르지 않고 로그인 안내', () => {
    render(<PointsHistoryView />);
    expect(getPointHistory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '카카오로 로그인' }));
    expect(startLogin).toHaveBeenCalledTimes(1);
  });

  it('요약(보유·적립·사용) + 날짜별 묶음, 점수 줄은 리플레이로, 강화 줄은 아이템 이름·레벨, 금액은 부호·색', async () => {
    login();
    getPointHistory.mockResolvedValueOnce(page([upgrade(61, 0), score(57, 74_074, 0, 163), score(49, 1_200, 1)]));
    await act(async () => {
      render(<PointsHistoryView />);
    });
    expect(getPointHistory).toHaveBeenCalledWith({ limit: 20 }, 'tok');
    expect(screen.getByTestId('points-summary').textContent).toContain('2,500,000 P');
    expect(screen.getByTestId('points-summary').textContent).toContain('적립 3,500,000 P · 사용 1,000,000 P');
    const list = screen.getByTestId('points-list');
    expect(within(list).getAllByRole('heading').map((h) => h.textContent)).toEqual(['오늘', '어제']);
    const up = screen.getByTestId('points-item-61');
    expect(up.textContent).toContain('블록 초콜릿 Lv2 강화');
    expect(up.textContent).toContain('−100,000 P');
    expect(within(up).queryByRole('link')).toBeNull();
    const sc = screen.getByTestId('points-item-57');
    expect(sc.textContent).toContain('+74,074 P');
    expect(within(sc).getByRole('link').getAttribute('href')).toBe('/games/tetris/replays/163');
  });

  it('[더 보기] — nextCursor를 beforeId로, 이어 붙이고 끝(null)이면 버튼이 사라진다', async () => {
    login();
    getPointHistory.mockResolvedValueOnce(page([score(10, 100, 0)], 10));
    await act(async () => {
      render(<PointsHistoryView />);
    });
    getPointHistory.mockResolvedValueOnce(page([score(9, 200, 2)], null));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    });
    expect(getPointHistory).toHaveBeenLastCalledWith({ beforeId: 10, limit: 20 }, 'tok');
    expect(screen.getByTestId('points-item-10')).toBeTruthy();
    expect(screen.getByTestId('points-item-9')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull();
  });

  it('보기(적립·사용) — type으로 처음부터 다시 받고, 늦게 온 이전 보기 응답은 버린다', async () => {
    login();
    const first = deferred<unknown>();
    getPointHistory.mockReturnValueOnce(first.promise);
    render(<PointsHistoryView />);
    getPointHistory.mockResolvedValueOnce(page([upgrade(61, 0)]));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '사용' }));
    });
    expect(getPointHistory).toHaveBeenLastCalledWith({ limit: 20, type: 'spend' }, 'tok');
    expect(screen.getByRole('button', { name: '사용' }).getAttribute('aria-pressed')).toBe('true');
    await act(async () => {
      first.resolve(page([score(57, 74_074, 0)]));
    });
    expect(screen.getByTestId('points-item-61')).toBeTruthy();
    expect(screen.queryByTestId('points-item-57')).toBeNull();
  });

  it('빈 목록은 보기에 맞는 안내, 401은 다시 로그인 안내', async () => {
    login();
    getPointHistory.mockResolvedValueOnce(page([]));
    const { unmount } = await act(async () => render(<PointsHistoryView />));
    expect(screen.getByText('아직 포인트 내역이 없어요.')).toBeTruthy();
    unmount();
    getPointHistory.mockRejectedValueOnce(new ApiError('AUTH_UNAUTHORIZED', '만료', 401));
    await act(async () => {
      render(<PointsHistoryView />);
    });
    expect(screen.getByRole('alert').textContent).toContain('로그인이 만료됐어요');
    expect(screen.getByRole('button', { name: '다시 로그인' })).toBeTruthy();
  });

  it('줄 설명 — 모르는 사유는 memo, meta가 이상하면 일반 문구, 점수 줄의 scoreId가 없으면 링크 없음', () => {
    expect(describePointItem({ ...upgrade(1, 0), meta: null })).toMatchObject({ title: '스킨 강화', replayHref: null });
    expect(describePointItem({ ...score(2, 1, 0), meta: null })).toMatchObject({ title: '테트리스 점수', replayHref: null });
    expect(describePointItem({ ...score(3, 1, 0), reason: 'ATTENDANCE', memo: '출석 보상' })).toMatchObject({ title: '출석 보상' });
    expect(formatSignedPoints(1234)).toBe('+1,234 P');
    expect(formatSignedPoints(-100000)).toBe('−100,000 P');
  });

  it('[더 보기]가 401이면 다시 로그인 안내로', async () => {
    login();
    getPointHistory.mockResolvedValueOnce(page([score(10, 100, 0)], 10));
    await act(async () => {
      render(<PointsHistoryView />);
    });
    getPointHistory.mockRejectedValueOnce(new ApiError('AUTH_UNAUTHORIZED', '만료', 401));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    });
    expect(screen.getByRole('alert').textContent).toContain('로그인이 만료됐어요');
    expect(screen.getByRole('button', { name: '다시 로그인' })).toBeTruthy();
  });

  it('세션은 있는데 토큰이 비어 있으면 스피너에 머물지 않고 로그인 안내', () => {
    session.value = { data: { user: {} }, status: 'authenticated' };
    render(<PointsHistoryView />);
    expect(getPointHistory).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '카카오로 로그인' })).toBeTruthy();
  });
});

