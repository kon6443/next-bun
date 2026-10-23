// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '@/types/api';
import type { BattleMatchListItem } from '@/services/tetrisBattleService';

const getBattleLobbyStats = vi.fn();
const getBattleMatchList = vi.fn();
vi.mock('@/services/tetrisBattleService', () => ({
  getBattleLobbyStats: (...a: unknown[]) => getBattleLobbyStats(...a),
  getBattleMatchList: (...a: unknown[]) => getBattleMatchList(...a),
}));

import { BattleEntry } from './BattleEntry';
import { RecentBattles } from './RecentBattles';
import { BattleMatchArchive } from './BattleMatchArchive';
import { clearBattleMatchCache } from '../lib/battleMatchLoader';

const item = (n: number): BattleMatchListItem => ({
  matchId: `match${String(n).padStart(11, '0')}`,
  roomName: `방 ${n}`,
  playerCount: 2,
  endedAt: new Date(Date.now() - n * 60_000).toISOString(),
  winnerName: `우승${n}`,
  players: [
    { name: `우승${n}`, place: 1 },
    { name: '상대', place: 2 },
  ],
  disputed: false,
});
const page = (items: BattleMatchListItem[], nextCursor: string | null) => ({ data: { items, nextCursor } });

describe('대전 입구 (DESIGN §19)', () => {
  beforeEach(() => {
    getBattleLobbyStats.mockReset();
    getBattleMatchList.mockReset();
    clearBattleMatchCache();
  });

  it('친구와 대전 + 열린 방 수 — StrictMode에서도 조회 한 번', async () => {
    getBattleLobbyStats.mockResolvedValue({ data: { waitingRooms: 2, playingRooms: 1 } });
    render(
      <StrictMode>
        <BattleEntry />
      </StrictMode>,
    );
    expect(screen.getByRole('link', { name: '친구와 대전' })).toHaveAttribute('href', '/games/tetris/battle');
    expect(await screen.findByText('지금 열린 방 2개')).toBeInTheDocument();
    expect(getBattleLobbyStats).toHaveBeenCalledTimes(1);
  });

  it('방 수 조회가 실패해도 버튼은 그대로, 문구만 없다', async () => {
    getBattleLobbyStats.mockRejectedValue(new ApiError('TOO_MANY_REQUESTS', 'x', 429));
    render(<BattleEntry />);
    await waitFor(() => expect(getBattleLobbyStats).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: '친구와 대전' })).toBeInTheDocument();
    expect(screen.queryByText(/열린 방|방을 만들어/)).toBeNull();
  });

  it('최근 대전: 5경기를 limit=5로, 각 줄은 기록 페이지로, 전체 보기는 목록으로', async () => {
    getBattleMatchList.mockResolvedValue(page([item(1), item(2)], 'next'));
    render(<RecentBattles />);
    const link = await screen.findByRole('link', { name: /방 1/ });
    expect(link).toHaveAttribute('href', `/games/tetris/battle/matches/${item(1).matchId}`);
    expect(link).toHaveTextContent('2인전 · 우승1 우승');
    expect(link).toHaveTextContent('1분 전');
    expect(getBattleMatchList).toHaveBeenCalledWith({ limit: 5, cursor: null });
    expect(screen.getByRole('link', { name: '전체 보기' })).toHaveAttribute('href', '/games/tetris/battle/matches');
  });

  it('최근 대전: 검증 실패 참가자가 있는 경기도 목록에 나오고 표시가 붙는다 (D-008)', async () => {
    getBattleMatchList.mockResolvedValue(page([{ ...item(1), disputed: true }], null));
    render(<RecentBattles />);
    expect(await screen.findByRole('link', { name: /방 1/ })).toHaveTextContent('우승1 우승 · 일부 기록 검증 실패');
  });

  it('최근 대전: 빈 목록 안내', async () => {
    getBattleMatchList.mockResolvedValue(page([], null));
    render(<RecentBattles />);
    expect(await screen.findByText('아직 저장된 대전이 없어요.')).toBeInTheDocument();
  });

  it('전체 목록: 더 보기로 다음 커서, 겹친 경기는 한 번, 마지막이면 버튼이 사라진다', async () => {
    getBattleMatchList
      .mockResolvedValueOnce(page([item(1), item(2)], 'c1'))
      .mockResolvedValueOnce(page([item(2), item(3)], null));
    render(
      <StrictMode>
        <BattleMatchArchive />
      </StrictMode>,
    );
    await screen.findByRole('link', { name: /방 2/ });
    expect(getBattleMatchList).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    await screen.findByRole('link', { name: /방 3/ });
    expect(getBattleMatchList).toHaveBeenLastCalledWith({ limit: 10, cursor: 'c1' });
    expect(within(screen.getByRole('list')).getAllByRole('link')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull();
  });

  it('전체 목록: 실패하면 다시 시도로 같은 페이지를 다시', async () => {
    getBattleMatchList.mockRejectedValueOnce(new ApiError('INTERNAL_SERVER_ERROR', 'x', 500)).mockResolvedValueOnce(page([], null));
    render(<BattleMatchArchive />);
    fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('아직 저장된 대전이 없어요.')).toBeInTheDocument();
    expect(getBattleMatchList).toHaveBeenLastCalledWith({ limit: 10, cursor: null });
  });

  it('전체 목록: 다음 페이지가 422(잘못된 cursor)면 같은 커서를 되풀이하지 않고 처음부터', async () => {
    getBattleMatchList
      .mockResolvedValueOnce(page([item(1)], 'bad'))
      .mockRejectedValueOnce(new ApiError('VALIDATION_ERROR', 'x', 422))
      .mockResolvedValueOnce(page([item(1), item(2)], null));
    render(<BattleMatchArchive />);
    fireEvent.click(await screen.findByRole('button', { name: '더 보기' }));
    fireEvent.click(await screen.findByRole('button', { name: '처음부터 다시 불러오기' }));
    await screen.findByRole('link', { name: /방 2/ });
    expect(getBattleMatchList).toHaveBeenLastCalledWith({ limit: 10, cursor: null });
    expect(within(screen.getByRole('list')).getAllByRole('link')).toHaveLength(2);
  });

  it('최근 대전: 실패하면 다시 시도로 다시 받는다', async () => {
    getBattleMatchList.mockRejectedValueOnce(new ApiError('TOO_MANY_REQUESTS', 'x', 429)).mockResolvedValueOnce(page([item(1)], null));
    render(<RecentBattles />);
    fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('link', { name: /방 1/ })).toBeInTheDocument();
  });

  it('전체 목록: 처음부터 다시가 일시 오류로 실패하면 다시 시도는 무효 커서가 아니라 첫 페이지를 다시', async () => {
    getBattleMatchList
      .mockResolvedValueOnce(page([item(1)], 'bad'))
      .mockRejectedValueOnce(new ApiError('VALIDATION_ERROR', 'x', 422))
      .mockRejectedValueOnce(new ApiError('TOO_MANY_REQUESTS', 'x', 429))
      .mockResolvedValueOnce(page([item(1), item(2)], null));
    render(<BattleMatchArchive />);
    fireEvent.click(await screen.findByRole('button', { name: '더 보기' }));
    fireEvent.click(await screen.findByRole('button', { name: '처음부터 다시 불러오기' }));
    fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
    await screen.findByRole('link', { name: /방 2/ });
    expect(getBattleMatchList.mock.calls.map(([p]) => p.cursor)).toEqual([null, 'bad', null, null]);
  });
});
