// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
vi.mock('@/services/gameService', () => ({
  getGameRankings: () => new Promise(() => {}),
  submitGameScore: vi.fn(),
}));
// 대전 입구는 이 테스트와 무관 — 조회 없이
vi.mock('./battle-ui/components/BattleEntry', () => ({ BattleEntry: () => null }));
vi.mock('./battle-ui/components/RecentBattles', () => ({ RecentBattles: () => null }));

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
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    fireEvent.click(screen.getByRole('checkbox', { name: /진동/ }));
    const writes = setItem.mock.calls.filter(([key]) => key === 'tetris:settings');
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0][1] as string).vibration).toBe(false); // 기본 켜짐 → 끔
    setItem.mockRestore();
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
});

