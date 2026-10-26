// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { accessToken: 'old' } }, status: 'authenticated' }), signIn: vi.fn() }));
const submitGameScore = vi.hoisted(() => vi.fn());
vi.mock('@/services/gameService', () => ({ submitGameScore }));
const startLogin = vi.hoisted(() => vi.fn());
vi.mock('@/app/auth/useKakaoLogin', () => ({ useKakaoLogin: () => ({ start: startLogin, isStarting: false }) }));

import { ApiError } from '@/types/api';
import { defenseStorage } from '../lib/defenseGame';
import { PendingSubmitCard } from './PendingSubmitCard';

describe('디펜스 보관분 다시 등록 — 로그인 만료', () => {
  beforeEach(() => {
    window.localStorage.clear();
    submitGameScore.mockReset();
    startLogin.mockReset();
  });

  it('401이면 보관을 지우지 않고 다시 로그인 버튼 — 익명으로 다시 내지 않는다', async () => {
    defenseStorage.savePendingSubmission({ sessionId: 'd1', playerName: '수비왕', replay: { engineVersion: 3, frames: 10, inputs: [] } as never, score: 3_000_000, savedAt: 1 });
    submitGameScore.mockRejectedValue(new ApiError('AUTH_UNAUTHORIZED', '만료', 401));
    await act(async () => {
      render(<PendingSubmitCard />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '다시 등록하기' }));
    });
    expect(submitGameScore).toHaveBeenCalledTimes(1);
    expect(screen.getByText('로그인이 만료됐어요. 다시 로그인하면 등록됩니다.')).toBeTruthy();
    expect(defenseStorage.loadPendingSubmissions().map((p) => p.sessionId)).toEqual(['d1']);
    fireEvent.click(screen.getByRole('button', { name: '다시 로그인' }));
    expect(startLogin).toHaveBeenCalledTimes(1);
  });
});
