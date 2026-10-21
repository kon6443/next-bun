// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ApiError } from '@/types/api';
import { ScoreSubmitPanel } from './ScoreSubmitPanel';
import { TEST_GAME } from './testGame';

const getGameRankings = vi.fn();
const submitGameScore = vi.fn();
vi.mock('@/services/gameService', () => ({
  getGameRankings: (...a: unknown[]) => getGameRankings(...a),
  submitGameScore: (...a: unknown[]) => submitGameScore(...a),
}));

const replay = { engineVersion: 1, frames: 300, inputs: [0, 0] };
const props = {
  game: TEST_GAME,
  score: 3_000_000,
  isNewBest: false,
  stats: <p>웨이브 3</p>,
  replay,
  board: 'endless-s1',
  sessionId: 'sess',
  sessionError: null,
  defaultName: '수비왕',
  onRestart: () => {},
};

describe('ScoreSubmitPanel — 게임 사양·보드를 따른다', () => {
  beforeEach(() => {
    getGameRankings.mockReset().mockResolvedValue({ code: 'SUCCESS', message: 'ok', data: { items: [], periodStart: null } });
    submitGameScore.mockReset();
    window.localStorage.clear();
  });

  it('예상 순위는 그 게임·보드로, 이름 칸 id는 게임별, 게임 요약을 보인다', async () => {
    await act(async () => {
      render(<ScoreSubmitPanel {...props} />);
    });
    expect(getGameRankings.mock.calls).toEqual([
      ['defense', 'daily', 100, 'endless-s1'],
      ['defense', 'weekly', 100, 'endless-s1'],
      ['defense', 'all', 100, 'endless-s1'],
    ]);
    expect(screen.getByLabelText('랭킹에 올릴 이름').id).toBe('defense-player-name');
    expect(screen.getByText('웨이브 3')).toBeTruthy();
    expect(screen.getByRole('link', { name: '나가기' }).getAttribute('href')).toBe('/games/defense');
  });

  it('등록 성공: 그 게임 저장소에 기록, 다시보기·랭킹 링크는 사양 경로', async () => {
    submitGameScore.mockResolvedValue({ code: 'SUCCESS', message: 'ok', data: { scoreId: 9, score: 3_000_000, detail: {}, ranks: { daily: 1, weekly: 1, all: 1 } } });
    await act(async () => {
      render(<ScoreSubmitPanel {...props} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '랭킹 등록' }));
    });
    expect(submitGameScore).toHaveBeenCalledWith('defense', { sessionId: 'sess', playerName: '수비왕', replay }, undefined);
    expect(window.localStorage.getItem('defense:myScoreIds')).toBe('[9]');
    expect(window.localStorage.getItem('defense:lastName')).toBe('수비왕');
    expect(screen.getByRole('link', { name: /내 플레이 다시보기/ }).getAttribute('href')).toBe('/games/defense/replays/9');
    expect(screen.getByRole('link', { name: '랭킹 보기' }).getAttribute('href')).toBe('/games/defense/rankings?highlight=9');
  });

  it('재시도할 실패(503 등)는 그 게임 저장소(사양의 위치)에 보관한다', async () => {
    submitGameScore.mockRejectedValue(new ApiError('GAME_VERIFY_BUSY', '밀림', 503));
    await act(async () => {
      render(<ScoreSubmitPanel {...props} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '랭킹 등록' }));
    });
    expect(TEST_GAME.storage.loadPendingSubmissions().map((p) => [p.sessionId, p.score])).toEqual([['sess', 3_000_000]]);
    expect(screen.getByRole('button', { name: '다시 등록하기' })).toBeTruthy();
  });
});
