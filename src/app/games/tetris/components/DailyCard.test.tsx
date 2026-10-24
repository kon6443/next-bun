// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { DailyCard } from './DailyCard';

const getGameBoards = vi.fn();
vi.mock('@/services/gameService', () => ({ getGameBoards: (...a: unknown[]) => getGameBoards(...a) }));

const today = { boardKey: 'daily-2026-10-24', mode: 'daily', current: true, startsAt: null, endsAt: null };

describe('테트리스 홈 "오늘의 테트리스" 카드 (games-growth B1)', () => {
  beforeEach(() => {
    getGameBoards.mockReset();
    window.localStorage.clear();
  });

  it('오늘 데일리 보드가 없거나 목록을 못 받으면 숨긴다', async () => {
    getGameBoards.mockResolvedValue({ data: { items: [{ ...today, boardKey: 'default', mode: null }] } });
    const { unmount } = await act(async () => render(<DailyCard />));
    expect(screen.queryByTestId('tetris-daily')).toBeNull();
    unmount();
    getGameBoards.mockRejectedValue(new Error('503'));
    await act(async () => {
      render(<DailyCard />);
    });
    expect(screen.queryByTestId('tetris-daily')).toBeNull();
  });

  it('오늘 안 했으면 도전하기, 했으면 첫 판 기록·공유·다시 도전', async () => {
    getGameBoards.mockResolvedValue({ data: { items: [today] } });
    const { unmount } = await act(async () => render(<DailyCard />));
    expect(screen.getByRole('link', { name: '도전하기' }).getAttribute('href')).toBe('/games/tetris/play/daily');
    expect(screen.getByRole('link', { name: '오늘 순위' }).getAttribute('href')).toBe('/games/tetris/rankings?board=daily-2026-10-24');
    unmount();

    window.localStorage.setItem('tetris:daily:first', JSON.stringify({ boardKey: 'daily-2026-10-24', score: 12340, lines: 40, level: 5, rank: 3 }));
    await act(async () => {
      render(<DailyCard />);
    });
    expect(screen.getByTestId('tetris-daily-first').textContent).toBe('오늘 첫 판 12,340점 · 3위');
    expect(screen.getByTestId('daily-share')).toBeTruthy();
    expect(screen.getByRole('link', { name: '다시 도전' })).toBeTruthy();
  });
});
