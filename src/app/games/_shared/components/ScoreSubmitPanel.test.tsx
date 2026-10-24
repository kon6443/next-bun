// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ApiError } from '@/types/api';
import { ScoreSubmitPanel, rankingsHref } from './ScoreSubmitPanel';
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
    // 보드가 있으면 그 보드 탭으로
    expect(screen.getByRole('link', { name: '랭킹 보기' }).getAttribute('href')).toBe('/games/defense/rankings?highlight=9&board=endless-s1');
  });

  it('점수 표기는 게임 사양(formatScore)을 따르고, 없으면 숫자(테트리스와 같은 1,234 표기)', async () => {
    const { unmount } = await act(async () => render(<ScoreSubmitPanel {...props} />));
    expect(screen.getByTestId('score-submit-score').textContent).toBe(props.score.toLocaleString('ko-KR'));
    unmount();
    await act(async () => {
      render(<ScoreSubmitPanel {...props} game={{ ...props.game, formatScore: (n: number) => `웨이브 ${Math.floor(n / 1_000_000)}` }} />);
    });
    expect(screen.getByTestId('score-submit-score').textContent).toBe(`웨이브 ${Math.floor(props.score / 1_000_000)}`);
  });

  it('보드가 없으면 랭킹 링크는 highlight만(테트리스 URL 불변), 기간을 하나만 주면 그 기간만 조회·표시, 다시보기 끄기', async () => {
    expect(rankingsHref('/games/tetris/rankings', 5)).toBe('/games/tetris/rankings?highlight=5');
    submitGameScore.mockResolvedValue({ code: 'SUCCESS', message: 'ok', data: { scoreId: 9, score: 3_000_000, detail: {}, ranks: { daily: 2, weekly: 2, all: 2 } } });
    await act(async () => {
      render(<ScoreSubmitPanel {...props} board="weekly-2026-w43" periods={[{ key: 'all', label: '주간 순위' }]} showReplay={false} />);
    });
    expect(getGameRankings.mock.calls).toEqual([['defense', 'all', 100, 'weekly-2026-w43']]);
    expect(screen.getByText('주간 순위')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '랭킹 등록' }));
    });
    expect(screen.queryByRole('link', { name: /내 플레이 다시보기/ })).toBeNull();
    expect(screen.getByText('2위')).toBeTruthy();
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

  it('게임 오버 순간 기록을 보관한다 — 등록 전에 새로고침·뒤로가기를 해도 남는다, 등록하면 지운다 (FE-05)', async () => {
    submitGameScore.mockResolvedValue({ data: { scoreId: 7, score: 3_000_000, ranks: null } });
    await act(async () => {
      render(<ScoreSubmitPanel {...props} />);
    });
    expect(TEST_GAME.storage.loadPendingSubmissions().map((p) => [p.sessionId, p.playerName, p.score])).toEqual([['sess', '수비왕', 3_000_000]]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '랭킹 등록' }));
    });
    expect(TEST_GAME.storage.loadPendingSubmissions()).toEqual([]);
  });

  it('기본 이름이 없으면 이름 없이 보관한다(다시 등록할 때 이름부터 묻는다)', async () => {
    await act(async () => {
      render(<ScoreSubmitPanel {...props} defaultName="" />);
    });
    expect(TEST_GAME.storage.loadPendingSubmissions().map((p) => p.playerName)).toEqual(['']);
  });

  it('등록하지 않고 "다시 하기"·"나가기"를 누르면 보관을 지운다 — 일시 실패로 보관한 기록은 남긴다', async () => {
    const onRestart = vi.fn();
    const first = await act(async () => render(<ScoreSubmitPanel {...props} onRestart={onRestart} />));
    fireEvent.click(screen.getByRole('button', { name: '다시 하기' }));
    // 등록하지 않은 기록이 사라지므로 먼저 묻는다 (FE-27) — 취소면 그대로
    expect(onRestart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '등록하러 가기' }));
    expect(TEST_GAME.storage.loadPendingSubmissions()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '다시 하기' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '다시 하기' }));
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(TEST_GAME.storage.loadPendingSubmissions()).toEqual([]);
    first.unmount();

    const second = await act(async () => render(<ScoreSubmitPanel {...props} />));
    fireEvent.click(screen.getByRole('link', { name: '나가기' }));
    expect(TEST_GAME.storage.loadPendingSubmissions()).toEqual([]);
    second.unmount();

    submitGameScore.mockRejectedValue(new ApiError('GAME_VERIFY_BUSY', '밀림', 503));
    await act(async () => {
      render(<ScoreSubmitPanel {...props} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '랭킹 등록' }));
    });
    // 일시 실패로 보관해 둔 기록은 사라지지 않으니 묻지 않고 바로
    fireEvent.click(screen.getByRole('button', { name: '다시 하기' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(TEST_GAME.storage.loadPendingSubmissions().map((p) => p.sessionId)).toEqual(['sess']);
  });

  it('엔진 버전이 달라 거절되면(배포 뒤 옛 화면) 새로고침 버튼을 주고 보관을 지운다', async () => {
    submitGameScore.mockRejectedValue(new ApiError('GAME_SESSION_INVALID', 'x', 409, 't', { reason: 'ENGINE_VERSION' }));
    await act(async () => {
      render(<ScoreSubmitPanel {...props} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '랭킹 등록' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('새 버전이 나왔어요');
    expect(screen.getByRole('button', { name: '새로고침' })).toBeTruthy();
    expect(TEST_GAME.storage.loadPendingSubmissions()).toEqual([]);
  });

  it('일시 실패를 보관하지 못하면(저장소 차단·용량) 떠나면 사라진다고 알린다 (FE-46)', async () => {
    submitGameScore.mockRejectedValue(new ApiError('GAME_VERIFY_BUSY', '밀림', 503));
    await act(async () => {
      render(<ScoreSubmitPanel {...props} />);
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '랭킹 등록' }));
    });
    setItem.mockRestore();
    expect(screen.getByRole('alert')).toHaveTextContent('이 기기에 보관하지 못해');
  });

  it('이름 오류는 알림(role=alert)으로 읽히고 입력칸으로 포커스가 돌아온다 — 서버 거절(금칙어)도 같다 (games-polish FE-30)', async () => {
    submitGameScore.mockRejectedValue(new ApiError('GAME_PLAYER_NAME_FORBIDDEN', '쓸 수 없는 이름이에요.', 422));
    await act(async () => {
      render(<ScoreSubmitPanel {...props} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '랭킹 등록' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('쓸 수 없는 이름이에요.');
    expect(document.activeElement).toBe(screen.getByLabelText('랭킹에 올릴 이름'));
  });

  it('등록 응답의 이름(서버 정리값)을 공유·최근 이름에 쓴다 — 응답에 없으면 보낸 이름 (games-polish P5)', async () => {
    submitGameScore.mockResolvedValue({ data: { scoreId: 7, score: 1, detail: {}, ranks: null, playerName: '서버 이름' } });
    const actions = vi.fn(() => null);
    await act(async () => {
      render(<ScoreSubmitPanel {...props} registeredActions={actions} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '랭킹 등록' }));
    });
    expect(actions).toHaveBeenLastCalledWith(expect.objectContaining({ scoreId: 7 }), '서버 이름');
    expect(TEST_GAME.storage.loadLastName()).toBe('서버 이름');
  });
});

