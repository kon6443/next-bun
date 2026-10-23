// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { GameSession } from '@/types/game';
import { ENGINE_VERSION } from '../../engine';

const createGameSession = vi.fn<() => Promise<{ data: GameSession }>>();
vi.mock('@/services/gameService', () => ({ createGameSession: () => createGameSession() }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
// 판은 그리지 않는다 — 준비 화면·시작 흐름만 본다
vi.mock('../../components/TetrisCanvas', () => ({ TetrisCanvas: () => null }));

import TetrisPlay, { SLOW_SESSION_MS, sessionTtlMs } from './TetrisPlay';

const HOUR = 60 * 60 * 1000;
const session = (expiresAt: string): GameSession => ({ sessionId: 's1', seed: 7, engineVersion: ENGINE_VERSION, expiresAt });

beforeEach(() => {
  createGameSession.mockReset();
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('세션 남은 시간 (Q-T1)', () => {
  it('응답 expiresAt까지 남은 시간 — 2시간 상한(기기 시계가 늦어도 길게 잡지 않는다), 읽을 수 없으면 상한', () => {
    const now = Date.parse('2026-10-23T00:00:00Z');
    expect(sessionTtlMs('2026-10-23T00:30:00Z', now)).toBe(HOUR / 2);
    expect(sessionTtlMs('2026-10-23T05:00:00Z', now)).toBe(2 * HOUR);
    expect(sessionTtlMs('2026-10-22T23:00:00Z', now)).toBe(0);
    expect(sessionTtlMs('not-a-date', now)).toBe(2 * HOUR);
  });
});

describe('TetrisPlay 시작 (games-polish FE-12)', () => {
  it('세션 응답이 늦으면 "등록 없이 시작"으로 바로 시작하고, 늦게 온 응답은 이 판을 바꾸지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let resolve: (v: { data: GameSession }) => void = () => {};
    createGameSession.mockImplementation(() => new Promise((r) => (resolve = r)));
    render(<TetrisPlay />);
    await act(async () => {});
    expect(screen.getByRole('button', { name: '시작' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '등록 없이 시작' })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(SLOW_SESSION_MS);
    });
    fireEvent.click(screen.getByRole('button', { name: '등록 없이 시작' }));
    expect(screen.queryByText('준비됐나요?')).toBeNull();
    await act(async () => resolve({ data: session('2099-01-01T00:00:00Z') }));
    expect(screen.queryByText('준비됐나요?')).toBeNull();
    expect(createGameSession).toHaveBeenCalledTimes(1);
  });

  it('남은 시간이 판 최대 길이보다 짧은 세션이면 시작할 때 새로 받은 뒤 시작한다', async () => {
    createGameSession
      .mockResolvedValueOnce({ data: session(new Date(Date.now() + HOUR / 2).toISOString()) })
      .mockResolvedValueOnce({ data: session(new Date(Date.now() + 2 * HOUR).toISOString()) });
    render(<TetrisPlay />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시작' }));
    });
    expect(createGameSession).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('준비됐나요?')).toBeNull();
  });
});
