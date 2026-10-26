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

const startLogin = vi.fn();
vi.mock('@/app/auth/useKakaoLogin', () => ({ useKakaoLogin: () => ({ start: startLogin, isStarting: false }) }));

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

  it('로그인 만료(401)면 익명으로 내지 않고 보관하고 다시 로그인하게 — 재로그인 뒤 시작 화면에서 보관분을 내 기록으로 등록 (USER_ID 누락)', async () => {
    submitGameScore.mockRejectedValue(new ApiError('AUTH_UNAUTHORIZED', '인증 만료', 401));
    await act(async () => {
      render(<ScoreSubmitPanel {...props} accessToken="expired" />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '랭킹 등록' }));
    });
    expect(submitGameScore).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toBe('로그인이 만료됐어요. 다시 로그인하면 등록됩니다.');
    expect(TEST_GAME.storage.loadPendingSubmissions().map((p) => p.sessionId)).toEqual(['sess']);
    // 같은 만료 토큰으로 다시 내지 않는다 — 다시 등록 버튼 대신 로그인
    expect(screen.queryByRole('button', { name: '다시 등록하기' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '다시 로그인하고 등록하기' }));
    expect(startLogin).toHaveBeenCalledWith({ callbackUrl: '/games/defense' });
    // 다시 하기를 눌러도 보관분은 남는다
    fireEvent.click(screen.getByRole('button', { name: '다시 하기' }));
    expect(TEST_GAME.storage.loadPendingSubmissions().map((p) => p.sessionId)).toEqual(['sess']);
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
    // 순위 계산이 실패(ranks null)하고 개인 최고도 아니면 자랑 문구 없음
    expect(actions).toHaveBeenLastCalledWith(expect.objectContaining({ scoreId: 7 }), '서버 이름', null);
    expect(TEST_GAME.storage.loadLastName()).toBe('서버 이름');
  });

  it('등록 뒤 동작에 자랑 문구를 넘긴다 — 보이는 기간의 10위 안이면 순위, 아니면 개인 최고, 둘 다 아니면 null (games-growth B3)', async () => {
    const actions = vi.fn(() => null);
    submitGameScore.mockResolvedValue({ data: { scoreId: 8, score: 1, detail: {}, ranks: { daily: 3, weekly: 12, all: 40 }, playerName: '이름' } });
    const { unmount } = await act(async () => render(<ScoreSubmitPanel {...props} registeredActions={actions} />));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '랭킹 등록' }));
    });
    expect(actions).toHaveBeenLastCalledWith(expect.anything(), '이름', '오늘 3위! 친구에게 자랑하기');
    unmount();

    // 보드 자체가 기간인 화면(전체 하나만 보임)은 보이지 않는 오늘 순위로 자랑하지 않는다 — 개인 최고로
    submitGameScore.mockResolvedValue({ data: { scoreId: 9, score: 1, detail: {}, ranks: { daily: 3, weekly: 12, all: 40 }, playerName: '이름' } });
    await act(async () => {
      render(<ScoreSubmitPanel {...props} isNewBest periods={[{ key: 'all', label: '이번 주 순위' }]} registeredActions={actions} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '랭킹 등록' }));
    });
    expect(actions).toHaveBeenLastCalledWith(expect.anything(), '이름', '개인 최고 갱신! 친구에게 자랑하기');
  });

  it('등록 전 보관에 보드를 같이 남긴다 — 다시 등록할 때 그 보드 순위로 읽게 (games-growth B1·B2)', async () => {
    await act(async () => {
      render(<ScoreSubmitPanel {...props} board="challenge-7" />);
    });
    expect(TEST_GAME.storage.loadPendingSubmissions().at(-1)).toMatchObject({ board: 'challenge-7' });
  });

  it('등록할 수 없는 판(세션 없음)은 예상 순위를 보이지도 부르지도 않는다 — 등록될 것처럼 읽히지 않게 (UX 점검)', async () => {
    await act(async () => {
      render(<ScoreSubmitPanel {...props} sessionId={null} sessionError="서버 응답이 늦어 이번 판은 랭킹 등록 없이 플레이해요." />);
    });
    expect(getGameRankings).not.toHaveBeenCalled();
    expect(screen.queryByText('일간')).toBeNull();
    expect(screen.queryByText(/예상|100위 밖/)).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('랭킹 등록 없이');
  });

  it('등록할 수 있는 동안 주버튼은 "랭킹 등록" — "다시 하기"는 보조, 등록할 수 없으면 "다시 하기"가 주버튼 (UX 점검)', async () => {
    // 주버튼 = 그라데이션 채움(Button primary), 보조 = 테두리만(secondary)
    const isPrimary = (el: HTMLElement) => el.className.includes('bg-gradient-to-r');
    const { unmount } = await act(async () => render(<ScoreSubmitPanel {...props} />));
    expect(isPrimary(screen.getByRole('button', { name: '랭킹 등록' }))).toBe(true);
    expect(isPrimary(screen.getByRole('button', { name: '다시 하기' }))).toBe(false);
    unmount();
    await act(async () => {
      render(<ScoreSubmitPanel {...props} sessionId={null} />);
    });
    expect(isPrimary(screen.getByRole('button', { name: '다시 하기' }))).toBe(true);
  });
});
