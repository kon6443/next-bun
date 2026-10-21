// @vitest-environment jsdom
import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ApiError } from '@/types/api';
import { GameOverPanel } from './GameOverPanel';

const getGameRankings = vi.fn();
const submitGameScore = vi.fn();
vi.mock('@/services/gameService', () => ({
  getGameRankings: (...args: unknown[]) => getGameRankings(...args),
  submitGameScore: (...args: unknown[]) => submitGameScore(...args),
}));

const props = {
  result: { score: 500, lines: 5, level: 1, frames: 600, isNewBest: false },
  replay: { engineVersion: 1, das: 10, arr: 2, frames: 600, inputs: [0, 8] },
  sessionId: 'session-1',
  sessionError: null,
  defaultName: '테스터',
  onRestart: () => {},
};

const page = (scores: number[]) => ({ code: 'SUCCESS', message: 'ok', data: { items: scores.map((score, i) => ({ score, scoreId: i })), periodStart: null } });

describe('GameOverPanel 예상 순위 요청', () => {
  beforeEach(() => {
    getGameRankings.mockReset();
    submitGameScore.mockReset();
    window.sessionStorage.clear();
  });

  it('StrictMode(effect 두 번 실행)에서도 게임 오버 1회에 기간별 1번씩 3요청', async () => {
    getGameRankings.mockResolvedValue(page([900, 400]));
    await act(async () => {
      render(
        <StrictMode>
          <GameOverPanel {...props} />
        </StrictMode>,
      );
    });
    expect(getGameRankings).toHaveBeenCalledTimes(3);
    expect(getGameRankings.mock.calls.map((c) => c[1]).sort()).toEqual(['all', 'daily', 'weekly']);
    expect(screen.getAllByText('예상 2위')).toHaveLength(3);
  });

  it('제출 실패(금칙어) 뒤에도 순위를 다시 요청하지 않는다', async () => {
    getGameRankings.mockResolvedValue(page([]));
    submitGameScore.mockRejectedValue(new ApiError('GAME_PLAYER_NAME_FORBIDDEN', '사용할 수 없는 이름', 422));
    await act(async () => {
      render(<GameOverPanel {...props} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '랭킹 등록' }));
    });
    expect(submitGameScore).toHaveBeenCalledTimes(1);
    expect(screen.getByText('사용할 수 없는 이름')).toBeTruthy();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('랭킹에 올릴 이름'), { target: { value: '다른이름' } });
    });
    expect(getGameRankings).toHaveBeenCalledTimes(3);
  });

  it('조회 실패(429)는 재시도하지 않고 "—"', async () => {
    getGameRankings.mockRejectedValue(new ApiError('TOO_MANY_REQUESTS', 'x', 429));
    await act(async () => {
      render(<GameOverPanel {...props} />);
    });
    expect(getGameRankings).toHaveBeenCalledTimes(3);
    expect(screen.getAllByText('—')).toHaveLength(3);
  });
});
