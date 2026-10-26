// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { GameSession } from '@/types/game';
import { ApiError } from '@/types/api';
import { ENGINE_VERSION } from '../../engine';

const createGameSession = vi.fn<() => Promise<{ data: GameSession }>>();
vi.mock('@/services/gameService', () => ({ createGameSession: () => createGameSession() }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
// 판은 그리지 않는다 — 준비 화면·시작 흐름만 본다
vi.mock('../../components/TetrisCanvas', () => ({ TetrisCanvas: () => null }));

import TetrisPlay, { SLOW_SESSION_MS } from './TetrisPlay';

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

  it('로그인이 만료돼 세션 발급이 401이면 익명 세션으로 바꾸지 않고, 다시 로그인하라고 알린 뒤 등록 없이 플레이 (USER_ID 누락)', async () => {
    createGameSession.mockRejectedValue(new ApiError('AUTH_UNAUTHORIZED', '인증 만료', 401));
    await act(async () => {
      render(<TetrisPlay />);
    });
    expect(createGameSession).toHaveBeenCalledTimes(1);
    expect(screen.getByText('로그인이 만료됐어요. 다시 로그인하면 랭킹에 등록할 수 있어요. 이번 판은 등록 없이 플레이해요.')).toBeTruthy();
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

  it('일시정지의 "처음부터"는 확인을 받는다 — 계속하기면 판이 그대로 (games-polish FE-27)', async () => {
    createGameSession.mockResolvedValue({ data: session(new Date(Date.now() + 2 * HOUR).toISOString()) });
    render(<TetrisPlay />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시작' }));
    });
    fireEvent.click(screen.getByRole('button', { name: '일시정지' }));
    fireEvent.click(screen.getByRole('button', { name: '처음부터' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('처음부터 다시 할까요?');
    fireEvent.click(within(dialog).getByRole('button', { name: '계속하기' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(createGameSession).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '처음부터' }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '처음부터' }));
    });
    expect(createGameSession).toHaveBeenCalledTimes(2);
    expect(screen.getByText('준비됐나요?')).toBeTruthy();
  });

  it('소리 설정 모달을 열면 판을 멈추고, 모달 안의 P·Esc는 뒤의 판을 다시 진행시키지 않는다 (P8)', async () => {
    createGameSession.mockResolvedValue({ data: session(new Date(Date.now() + 2 * HOUR).toISOString()) });
    render(<TetrisPlay />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시작' }));
    });
    expect(screen.getByRole('button', { name: '일시정지' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /소리 설정/ }));
    const dialog = screen.getByRole('dialog', { name: '소리 설정' });
    expect(screen.queryByRole('button', { name: '일시정지' })).toBeNull();
    fireEvent.keyDown(within(dialog).getByRole('button', { name: '닫기' }), { code: 'KeyP', key: 'p' });
    expect(screen.queryByRole('button', { name: '일시정지' })).toBeNull();
    fireEvent.keyDown(dialog, { code: 'Escape', key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '소리 설정' })).toBeNull();
    expect(screen.queryByRole('button', { name: '일시정지' })).toBeNull();
  });
});
