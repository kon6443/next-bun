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

  it('아래 설정 섹션은 진입 줄 하나 — 같은 시트를 열고, 닫으면 그 줄로 포커스가 돌아온다 (D-001)', async () => {
    await act(async () => {
      render(<TetrisHome />);
    });
    expect(screen.queryByRole('slider', { name: /DAS/ })).toBeNull();
    // 키보드 조작 표는 홈에 두지 않는다 — 시트 조작 상세·플레이 준비 화면에 (D-005)
    expect(screen.queryByText('Space')).toBeNull();
    const entry = screen.getByTestId('tetris-settings-entry');
    // 키보드로 누른 경우(포커스가 줄에 있다)
    entry.focus();
    fireEvent.click(entry);
    const sheet = screen.getByRole('dialog', { name: '설정' });
    expect(within(sheet).getByTestId('settings-group-controls')).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(entry);
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
      fireEvent.click(screen.getByRole('button', { name: '다시 등록하기' }));
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
      fireEvent.click(screen.getByRole('button', { name: '다시 등록하기' }));
    });
    expect(screen.getByText('로그인이 만료됐어요. 다시 로그인하면 등록됩니다.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 로그인' })).toBeTruthy();
    expect(tetrisStorage.loadPendingSubmissions().map((p) => p.sessionId)).toEqual(['s3']);
  });
});
