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
    window.localStorage.clear();
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

  it('등록 성공: 서버 순위·다시보기·랭킹 강조 링크(테트리스 경로), 내 기록·이름 저장', async () => {
    getGameRankings.mockResolvedValue(page([]));
    submitGameScore.mockResolvedValue({ code: 'SUCCESS', message: 'ok', data: { scoreId: 9, score: 510, detail: {}, ranks: { daily: 1, weekly: 2, all: 3 } } });
    await act(async () => {
      render(<GameOverPanel {...props} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '랭킹 등록' }));
    });
    expect(submitGameScore).toHaveBeenCalledWith('tetris', { sessionId: 'session-1', playerName: '테스터', replay: props.replay }, undefined);
    expect(screen.getByText('510')).toBeTruthy();
    expect(screen.getAllByText(/^[123]위$/).map((el) => el.textContent)).toEqual(['1위', '2위', '3위']);
    expect(screen.getByRole('link', { name: /내 플레이 다시보기/ }).getAttribute('href')).toBe('/games/tetris/replays/9');
    expect(screen.getByRole('link', { name: '랭킹 보기' }).getAttribute('href')).toBe('/games/tetris/rankings?highlight=9');
    expect(screen.getByRole('link', { name: '나가기' }).getAttribute('href')).toBe('/games/tetris');
    expect(window.localStorage.getItem('tetris:myScoreIds')).toBe('[9]');
    // 전체 3위 — 넓은 기간부터 본다, 결과 화면 공유 버튼을 강조하고 자랑 문구로 (games-growth B3)
    const share = screen.getByTestId('result-share');
    expect(share.textContent).toBe('전체 3위! 친구에게 자랑하기');
    expect(share.dataset.brag).toBe('true');
    expect(window.localStorage.getItem('tetris:lastName')).toBe('테스터');
  });

  it('조회 실패(429)는 재시도하지 않고 "—"', async () => {
    getGameRankings.mockRejectedValue(new ApiError('TOO_MANY_REQUESTS', 'x', 429));
    await act(async () => {
      render(<GameOverPanel {...props} />);
    });
    expect(getGameRankings).toHaveBeenCalledTimes(3);
    expect(screen.getAllByText('—')).toHaveLength(3);
  });

  it('상위권도 개인 최고도 아니면 공유 버튼은 평소 문구 그대로 (games-growth B3)', async () => {
    getGameRankings.mockResolvedValue(page([]));
    submitGameScore.mockResolvedValue({ code: 'SUCCESS', message: 'ok', data: { scoreId: 10, score: 500, detail: {}, ranks: { daily: 11, weekly: 30, all: 300 } } });
    await act(async () => {
      render(<GameOverPanel {...props} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '랭킹 등록' }));
    });
    const share = screen.getByTestId('result-share');
    expect(share.textContent).toBe('이 기록 공유하기');
    expect(share.dataset.brag).toBeUndefined();
  });

  it('오늘의 테트리스: 그날 순위 하나·다시보기 없음·데일리 랭킹 링크, 첫 판이면 순위를 공유 기록에 붙인다 (games-growth B1)', async () => {
    window.localStorage.setItem('tetris:daily:first', JSON.stringify({ boardKey: 'daily-2026-10-24', score: 500, lines: 5, level: 1 }));
    getGameRankings.mockResolvedValue(page([]));
    submitGameScore.mockResolvedValue({ code: 'SUCCESS', message: 'ok', data: { scoreId: 31, score: 500, detail: {}, ranks: { daily: 3, weekly: 3, all: 3 } } });
    await act(async () => {
      render(<GameOverPanel {...props} daily={{ boardKey: 'daily-2026-10-24', isFirstRun: true }} />);
    });
    expect(getGameRankings).toHaveBeenCalledTimes(1);
    expect(getGameRankings).toHaveBeenCalledWith('tetris', 'all', 100, 'daily-2026-10-24');
    expect(screen.getByText('오늘의 순위')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '랭킹 등록' }));
    });
    expect(screen.queryByRole('link', { name: /내 플레이 다시보기/ })).toBeNull();
    expect(screen.getByRole('link', { name: '랭킹 보기' }).getAttribute('href')).toBe('/games/tetris/rankings?highlight=31&board=daily-2026-10-24');
    expect(screen.getByTestId('daily-share')).toBeTruthy();
    expect(screen.queryByTestId('result-share')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('tetris:daily:first')!)).toMatchObject({ scoreId: 31, rank: 3 });
  });

  it('오늘의 테트리스 다시 도전한 판은 첫 판 기록에 순위를 붙이지 않는다', async () => {
    window.localStorage.setItem('tetris:daily:first', JSON.stringify({ boardKey: 'daily-2026-10-24', score: 500, lines: 5, level: 1 }));
    getGameRankings.mockResolvedValue(page([]));
    submitGameScore.mockResolvedValue({ code: 'SUCCESS', message: 'ok', data: { scoreId: 32, score: 900, detail: {}, ranks: { daily: 1, weekly: 1, all: 1 } } });
    await act(async () => {
      render(<GameOverPanel {...props} daily={{ boardKey: 'daily-2026-10-24', isFirstRun: false }} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '랭킹 등록' }));
    });
    expect(screen.getByText(/다시 도전한 판이에요/)).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem('tetris:daily:first')!).rank).toBeUndefined();
  });
});
