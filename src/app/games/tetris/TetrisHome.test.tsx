// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
const submitGameScore = vi.hoisted(() => vi.fn());
vi.mock('@/services/gameService', () => ({
  getGameRankings: () => new Promise(() => {}),
  submitGameScore,
}));
// 대전 입구는 이 테스트와 무관 — 조회 없이
vi.mock('./battle-ui/components/BattleEntry', () => ({ BattleEntry: () => null }));
// 홈 채팅 카드는 대전 소켓을 연다 — 홈 테스트에서는 자리만(카드 자체는 HomeLobbyChat.test)
vi.mock('./battle-ui/components/HomeLobbyChat', () => ({ HomeLobbyChat: () => <section data-testid="home-lobby-chat" /> }));
vi.mock('./battle-ui/components/RecentBattles', () => ({ RecentBattles: () => null }));
vi.mock('@/app/games/_shared/components/PopularReplaysPreview', () => ({ PopularReplaysPreview: () => null }));
vi.mock('./components/DailyCard', () => ({ DailyCard: () => null }));

import { ApiError } from '@/types/api';
import TetrisHome from './TetrisHome';
import { tetrisStorage } from './lib/storage';

describe('TetrisHome 설정 (games-polish FE-52)', () => {
  it('설정을 바꾸면 한 번만 저장한다 — StrictMode에서도 상태 업데이터가 저장하지 않는다', async () => {
    await act(async () => {
      render(
        <StrictMode>
          <TetrisHome />
        </StrictMode>,
      );
    });
    // 조작 설정은 공통 설정 시트에 — 머리줄 톱니로 연다 (D-001)
    fireEvent.click(screen.getByRole('button', { name: /^설정 \(소리/ }));
    fireEvent.click(screen.getByTestId('settings-group-controls'));
    const sheet = screen.getByRole('dialog', { name: '조작' });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    fireEvent.click(within(sheet).getByRole('checkbox', { name: /진동/ }));
    const writes = setItem.mock.calls.filter(([key]) => key === 'tetris:settings');
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0][1] as string).vibration).toBe(false); // 기본 켜짐 → 끔
    setItem.mockRestore();
  });

  it('위계(tetris-home-chat) — 상단 바(h1·내 스킨·톱니) → 게임 시작 → 로비 채팅 → 기록 탭(오늘 랭킹 먼저), 채움 버튼은 게임 시작 하나', async () => {
    await act(async () => {
      render(<TetrisHome />);
    });
    const heading = screen.getByRole('heading', { level: 1, name: '테트리스' });
    const skin = screen.getByRole('button', { name: /^내 스킨/ });
    const settings = screen.getByTestId('tetris-settings-open');
    const start = screen.getByRole('link', { name: /^게임 시작/ });
    const chat = screen.getByTestId('home-lobby-chat');
    const tabs = screen.getByRole('tablist', { name: '기록' });
    // 내 스킨 한 줄 카드는 없다 — 상단 바 아이콘으로 옮겼다
    expect(screen.queryByTestId('my-skin-card')).toBeNull();
    for (const [before, after] of [
      [heading, skin],
      [skin, settings],
      [settings, start],
      [start, chat],
      [chat, tabs],
    ]) {
      expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['오늘 랭킹', '인기 리플레이', '최근 대전']);
    expect(within(tabs).getByRole('tab', { name: '오늘 랭킹' }).getAttribute('aria-selected')).toBe('true');
    // 설정 카드·스킨 도감 큰 버튼은 없다 — 설정은 톱니, 도감은 아래 링크 줄
    expect(screen.queryByTestId('tetris-settings-entry')).toBeNull();
    expect(screen.getByRole('link', { name: '스킨 도감' }).getAttribute('href')).toBe('/games/tetris/skins');
    // 게스트는 포인트 내역 링크가 없다(로그인 전용 화면)
    expect(screen.queryByRole('link', { name: '포인트 내역' })).toBeNull();
    expect(screen.getByRole('link', { name: '게임 목록' }).getAttribute('href')).toBe('/games');
  });

  it('설정은 오른쪽 위 톱니 한 곳 — 같은 시트를 열고, 닫으면 톱니로 포커스가 돌아온다 (D-001)', async () => {
    await act(async () => {
      render(<TetrisHome />);
    });
    expect(screen.queryByRole('slider', { name: /DAS/ })).toBeNull();
    // 키보드 조작 표는 홈에 두지 않는다 — 시트 조작 상세·플레이 준비 화면에 (D-005)
    expect(screen.queryByText('Space')).toBeNull();
    const gear = screen.getByTestId('tetris-settings-open');
    gear.focus();
    fireEvent.click(gear);
    const sheet = screen.getByRole('dialog', { name: '설정' });
    expect(within(sheet).getByTestId('settings-group-controls')).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(gear);
  });

  it('기록 탭 — 다른 탭은 고를 때 처음 그리고(요청을 늘리지 않게), ←·→로 옮긴다', async () => {
    await act(async () => {
      render(<TetrisHome />);
    });
    const tabs = screen.getByRole('tablist', { name: '기록' });
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    // 아직 그리지 않은 탭은 가리킬 패널이 없다
    expect(within(tabs).getByRole('tab', { name: '인기 리플레이' }).hasAttribute('aria-controls')).toBe(false);
    const ranking = within(tabs).getByRole('tab', { name: '오늘 랭킹' });
    ranking.focus();
    fireEvent.keyDown(ranking, { key: 'ArrowRight' });
    const replays = within(tabs).getByRole('tab', { name: '인기 리플레이' });
    expect(replays.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(replays);
    // 오늘 랭킹 패널은 남아 있다(숨김) — 다시 오갈 때 다시 받지 않게
    expect(screen.getAllByRole('tabpanel', { hidden: true })).toHaveLength(2);
    expect(screen.getByRole('link', { name: '인기 리플레이 전체 보기' }).getAttribute('href')).toBe('/games/tetris/rankings');
    fireEvent.keyDown(replays, { key: 'End' });
    expect(within(tabs).getByRole('tab', { name: '최근 대전' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('link', { name: '최근 대전 전체 보기' }).getAttribute('href')).toBe('/games/tetris/battle/matches');
  });

  it('등록하지 못한 기록은 확인 뒤 버릴 수 있다 — 이름 없이 보관된 기록은 "등록할 이름"을 묻는다 (games-polish P5)', async () => {
    tetrisStorage.savePendingSubmission({ sessionId: 's1', playerName: '', replay: { frames: 1, inputs: [], seed: 1, das: 10, arr: 2, engineVersion: 1 } as never, score: 500, savedAt: 1 });
    await act(async () => {
      render(<TetrisHome />);
    });
    expect(screen.getByLabelText('등록할 이름 (1~12자)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '버리기' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '버리기' }));
    expect(tetrisStorage.loadPendingSubmissions()).toEqual([]);
    expect(screen.queryByText(/등록하지 못한 기록이 있어요/)).toBeNull();
  });

  it('데일리 판을 다시 등록하면 그 보드 순위로 알린다 — "전체 N위"가 아니라 (games-growth B1)', async () => {
    window.sessionStorage.clear();
    tetrisStorage.savePendingSubmission({ sessionId: 's2', playerName: '테스터', replay: { frames: 1, inputs: [], das: 10, arr: 2, engineVersion: 1 } as never, score: 500, savedAt: 1, board: 'daily-2026-10-24' });
    submitGameScore.mockResolvedValue({ data: { scoreId: 9, score: 500, detail: {}, ranks: { daily: 3, weekly: 3, all: 3 } } });
    await act(async () => {
      render(<TetrisHome />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /다시 등록하기/ }));
    });
    // 제출 본문에는 보드를 싣지 않는다(DTO 밖 필드는 422)
    expect(submitGameScore).toHaveBeenCalledWith('tetris', { sessionId: 's2', playerName: '테스터', replay: expect.anything() }, undefined);
    expect(screen.getByText('등록했어요! 10/24 데일리 3위')).toBeTruthy();
  });

  it('보관분 재등록이 로그인 만료(401)면 보관을 지우지 않고 다시 로그인 버튼을 준다', async () => {
    window.localStorage.clear();
    tetrisStorage.savePendingSubmission({ sessionId: 's3', playerName: '테스터', replay: { frames: 1, inputs: [], das: 10, arr: 2, engineVersion: 1 } as never, score: 500, savedAt: 1 });
    submitGameScore.mockRejectedValue(new ApiError('AUTH_UNAUTHORIZED', '만료', 401));
    await act(async () => {
      render(<TetrisHome />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /다시 등록하기/ }));
    });
    expect(screen.getByText('로그인이 만료됐어요. 다시 로그인하면 등록됩니다.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 로그인' })).toBeTruthy();
    expect(tetrisStorage.loadPendingSubmissions().map((p) => p.sessionId)).toEqual(['s3']);
  });

  it('등록 못 한 기록 — 이름이 있으면 한 줄(등록·버리기), 이름을 물어야 하면 펼친다 (tetris-home D-003)', async () => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    tetrisStorage.savePendingSubmission({ sessionId: 's9', playerName: '개발자', replay: { frames: 1, inputs: [], seed: 1, das: 10, arr: 2, engineVersion: 1 } as never, score: 12340, savedAt: 1 });
    await act(async () => {
      render(<TetrisHome />);
    });
    const banner = screen.getByTestId('tetris-pending');
    expect(banner.textContent).toContain('등록 못 한 기록 12,340점');
    expect(within(banner).getByRole('button', { name: '개발자 12,340점 다시 등록하기' })).toHaveTextContent('등록');
    expect(within(banner).getByRole('button', { name: '버리기' })).toBeTruthy();
    expect(within(banner).queryByLabelText(/등록할 이름|다른 이름으로 등록/)).toBeNull();
  });

  it('한 줄 배너에서 등록이 이름 문제로 거절되면 펼친 폼의 이름 칸으로 포커스 — 누른 버튼이 사라져도 자리를 잃지 않게', async () => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    tetrisStorage.savePendingSubmission({ sessionId: 's8', playerName: '나쁜이름', replay: { frames: 1, inputs: [], seed: 1, das: 10, arr: 2, engineVersion: 1 } as never, score: 900, savedAt: 1 });
    submitGameScore.mockRejectedValueOnce(new ApiError('GAME_PLAYER_NAME_FORBIDDEN', '쓸 수 없는 이름이에요.', 422));
    await act(async () => {
      render(<TetrisHome />);
    });
    const register = within(screen.getByTestId('tetris-pending')).getByRole('button', { name: /다시 등록하기/ });
    register.focus();
    await act(async () => {
      fireEvent.click(register);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    const input = screen.getByLabelText(/다른 이름으로 등록/);
    expect(document.activeElement).toBe(input);
  });
});
