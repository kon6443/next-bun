// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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

  it('첫 판 전 — 타일이 곧 도전하기 링크(순위 링크는 없다)', async () => {
    getGameBoards.mockResolvedValue({ data: { items: [today] } });
    await act(async () => {
      render(<DailyCard />);
    });
    const tile = screen.getByRole('link', { name: /도전하기/ });
    expect(tile.getAttribute('href')).toBe('/games/tetris/play/daily');
    expect(tile.textContent).toContain('오늘의 테트리스');
    expect(screen.queryByRole('link', { name: '오늘 순위' })).toBeNull();
  });

  it('첫 판 뒤 — 타일에 요약("오늘 N위 · 다시"), 누르면 시트에서 다시 도전·오늘 순위·공유, 닫으면 타일로 포커스', async () => {
    getGameBoards.mockResolvedValue({ data: { items: [today] } });
    window.localStorage.setItem('tetris:daily:first', JSON.stringify({ boardKey: 'daily-2026-10-24', score: 12340, lines: 40, level: 5, rank: 3 }));
    await act(async () => {
      render(<DailyCard />);
    });
    const tile = screen.getByRole('button', { name: /오늘의 테트리스 오늘 3위/ });
    expect(screen.getByTestId('tetris-daily-summary').textContent).toContain('오늘 3위 · 다시');
    expect(screen.queryByRole('dialog')).toBeNull();
    tile.focus();
    fireEvent.click(tile);
    const sheet = screen.getByRole('dialog', { name: /오늘의 테트리스/ });
    expect(within(sheet).getByTestId('tetris-daily-first').textContent).toBe('오늘 첫 판 12,340점 · 3위');
    expect(within(sheet).getByRole('link', { name: '다시 도전' }).getAttribute('href')).toBe('/games/tetris/play/daily');
    expect(within(sheet).getByRole('link', { name: '오늘 순위' }).getAttribute('href')).toBe('/games/tetris/rankings?board=daily-2026-10-24');
    expect(within(sheet).getByRole('button', { name: '오늘 결과 공유하기' })).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(tile);
  });

  it('첫 판 뒤 순위를 못 받았으면 요약은 점수', async () => {
    getGameBoards.mockResolvedValue({ data: { items: [today] } });
    window.localStorage.setItem('tetris:daily:first', JSON.stringify({ boardKey: 'daily-2026-10-24', score: 12340, lines: 40, level: 5 }));
    await act(async () => {
      render(<DailyCard />);
    });
    expect(screen.getByTestId('tetris-daily-summary').textContent).toContain('12,340점 · 다시');
  });

  it('마우스·터치로 연 시트(타일에 포커스 없음)를 닫아도 타일로 포커스가 돌아온다', async () => {
    getGameBoards.mockResolvedValue({ data: { items: [today] } });
    window.localStorage.setItem('tetris:daily:first', JSON.stringify({ boardKey: 'daily-2026-10-24', score: 12340, lines: 40, level: 5, rank: 3 }));
    await act(async () => {
      render(<DailyCard />);
    });
    const tile = screen.getByRole('button', { name: /오늘의 테트리스/ });
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(tile);
    expect(tile.getAttribute('aria-expanded')).toBe('true');
    // 시트 안 공유는 테두리형 짧은 문구 — 채움 버튼은 게임 시작 하나
    const share = screen.getByRole('button', { name: '오늘 결과 공유하기' });
    expect(share.textContent).toBe('🟩 공유');
    expect(share.className).not.toContain('bg-gradient');
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(document.activeElement).toBe(tile);
  });

  it('보드를 받는 동안은 타일 자리를 잡아 두고(가로 밀림 없게), 보드가 없으면 자리를 뺀다', async () => {
    let resolve!: (v: unknown) => void;
    getGameBoards.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<DailyCard />);
    expect(screen.getByTestId('tetris-daily-placeholder').getAttribute('aria-hidden')).toBe('true');
    await act(async () => {
      resolve({ data: { items: [{ ...today, boardKey: 'default', mode: null }] } });
    });
    expect(screen.queryByTestId('tetris-daily-placeholder')).toBeNull();
    expect(screen.queryByTestId('tetris-daily')).toBeNull();
  });
});
