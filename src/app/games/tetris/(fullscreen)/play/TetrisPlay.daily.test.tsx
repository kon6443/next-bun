// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import type { GameState } from '../../engine';
import { ENGINE_VERSION } from '../../engine';
import { ApiError } from '@/types/api';
import type { ReplayPayload } from '@/types/game';

const createGameSession = vi.fn();
const getGameScore = vi.fn();
vi.mock('@/services/gameService', () => ({
  createGameSession: (...args: unknown[]) => createGameSession(...args),
  getGameScore: (...args: unknown[]) => getGameScore(...args),
}));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
vi.mock('../../components/TetrisCanvas', () => ({ TetrisCanvas: () => null }));
// 판 진행은 엔진 훅 몫 — 여기서는 판이 끝났을 때(onGameOver) 데일리 기록을 남기는지만 본다
const play = vi.hoisted(() => ({ onGameOver: null as null | ((state: GameState, replay: ReplayPayload) => void) }));
vi.mock('../../hooks/useTetrisPlay', () => ({
  useTetrisPlay: (options: { onGameOver: (state: GameState, replay: ReplayPayload) => void }) => {
    play.onGameOver = options.onGameOver;
    const noop = () => {};
    return { stateRef: { current: null }, afterTickRef: { current: null }, effectsRef: { current: null }, status: 'ready', hud: { score: 0, lines: 0, level: 1, frame: 0 }, start: noop, reset: noop, pause: noop, resume: noop, press: noop, release: noop, instant: noop };
  },
}));

import TetrisPlay from './TetrisPlay';

const HOUR = 60 * 60 * 1000;
const dailySession = { sessionId: 'd1', seed: 42, engineVersion: ENGINE_VERSION, expiresAt: new Date(Date.now() + 2 * HOUR).toISOString(), boardKey: 'daily-2026-10-24', mode: 'daily' };
const over = (score: number) => ({ score, lines: 12, level: 3, endFrame: 600 }) as unknown as GameState;
const replay: ReplayPayload = { engineVersion: ENGINE_VERSION, das: 10, arr: 2, frames: 600, inputs: [] };

describe('오늘의 테트리스 플레이 (games-growth B1)', () => {
  beforeEach(() => {
    createGameSession.mockReset();
    window.localStorage.clear();
    window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  });

  it('데일리 세션을 board "daily"로 받고, 판이 끝나면 이 기기의 오늘 첫 판만 남긴다', async () => {
    createGameSession.mockResolvedValue({ data: dailySession });
    await act(async () => {
      render(<TetrisPlay daily />);
    });
    expect(createGameSession).toHaveBeenCalledWith('tetris', undefined, 'daily');
    expect(screen.getByRole('heading', { name: '오늘의 테트리스' })).toBeTruthy();

    act(() => play.onGameOver!(over(1200), replay));
    expect(JSON.parse(window.localStorage.getItem('tetris:daily:first')!)).toEqual({ boardKey: 'daily-2026-10-24', score: 1200, lines: 12, level: 3 });
    // 다시 도전한 판은 첫 판을 덮지 않는다
    act(() => play.onGameOver!(over(9999), replay));
    expect(JSON.parse(window.localStorage.getItem('tetris:daily:first')!).score).toBe(1200);
  });

  it('일반 판은 board 없이 받고 데일리 기록을 남기지 않는다', async () => {
    createGameSession.mockResolvedValue({ data: { ...dailySession, boardKey: 'default', mode: null } });
    await act(async () => {
      render(<TetrisPlay />);
    });
    expect(createGameSession).toHaveBeenCalledWith('tetris', undefined, undefined);
    act(() => play.onGameOver!(over(500), replay));
    expect(window.localStorage.getItem('tetris:daily:first')).toBeNull();
  });

  it('데일리를 열 수 없으면(503 GAME_DAILY_UNAVAILABLE) 안내하고 일반 판으로 — 첫 판 기록도 남기지 않는다', async () => {
    createGameSession.mockRejectedValue(new ApiError('GAME_DAILY_UNAVAILABLE', 'x', 503));
    await act(async () => {
      render(<TetrisPlay daily />);
    });
    expect(screen.getByRole('status').textContent).toContain('지금은 오늘의 테트리스를 열 수 없어요');
    act(() => play.onGameOver!(over(500), replay));
    expect(window.localStorage.getItem('tetris:daily:first')).toBeNull();
  });
});

describe('테트리스 도전장 플레이 (games-growth B2)', () => {
  beforeEach(() => {
    createGameSession.mockReset();
    getGameScore.mockReset();
    window.localStorage.clear();
  });

  it('도전장 세션을 challengeScoreId로 받고, 세션의 원본(root) 기록을 한 번 받아 제목에 보인다', async () => {
    createGameSession.mockResolvedValue({ data: { ...dailySession, boardKey: 'challenge-7', mode: 'challenge' } });
    getGameScore.mockResolvedValue({ data: { scoreId: 7, playerName: '원본왕', score: 12340, rank: 1, detail: { lines: 40, level: 5 }, durationMs: 1, createdAt: 'x' } });
    await act(async () => {
      render(
        <StrictMode>
          <TetrisPlay challengeScoreId={41} />
        </StrictMode>,
      );
    });
    expect(createGameSession).toHaveBeenCalledWith('tetris', undefined, { challengeScoreId: 41 });
    // 링크의 id(41)가 도전장 기록이어도 원본(7)을 보인다
    expect(getGameScore).toHaveBeenCalledTimes(1);
    expect(getGameScore).toHaveBeenCalledWith('tetris', 7);
    expect(screen.getByRole('heading', { name: '원본왕님의 12,340점에 도전!' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '시작' })).toBeTruthy();
    // 도전장 판은 데일리 기록을 남기지 않는다
    act(() => play.onGameOver!(over(500), replay));
    expect(window.localStorage.getItem('tetris:daily:first')).toBeNull();
  });

  it('원본이 없거나 지난 버전이면 시작을 막고 일반 게임으로 안내한다 — 다른 seed로 하면 도전이 아니다', async () => {
    createGameSession.mockRejectedValue(new ApiError('GAME_CHALLENGE_EXPIRED', 'x', 409));
    const { unmount } = await act(async () => render(<TetrisPlay challengeScoreId={41} />));
    expect(screen.getByRole('status').textContent).toContain('지난 버전 게임의 기록이라');
    expect(screen.queryByRole('button', { name: '시작' })).toBeNull();
    expect(screen.getByRole('link', { name: '일반 게임 하기' }).getAttribute('href')).toBe('/games/tetris/play');
    unmount();

    createGameSession.mockRejectedValue(new ApiError('GAME_SCORE_NOT_FOUND', 'x', 404));
    await act(async () => {
      render(<TetrisPlay challengeScoreId={41} />);
    });
    expect(screen.getByRole('status').textContent).toContain('도전할 기록을 찾을 수 없어요');
    expect(screen.queryByRole('button', { name: '시작' })).toBeNull();
  });

  it('망 오류(503 등)면 막지 않고 등록 없이 플레이할 수 있다', async () => {
    createGameSession.mockRejectedValue(new ApiError('GAME_SESSION_UNAVAILABLE', 'x', 503));
    await act(async () => {
      render(<TetrisPlay challengeScoreId={41} />);
    });
    expect(screen.getByRole('button', { name: '시작' })).toBeTruthy();
  });
});
