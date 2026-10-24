// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
vi.mock('@/services/gameService', () => ({
  getGameRankings: () => new Promise(() => {}),
  submitGameScore: vi.fn(),
}));
// 대전 입구는 이 테스트와 무관 — 조회 없이
vi.mock('./battle-ui/components/BattleEntry', () => ({ BattleEntry: () => null }));
vi.mock('./battle-ui/components/RecentBattles', () => ({ RecentBattles: () => null }));

import TetrisHome from './TetrisHome';

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
});
