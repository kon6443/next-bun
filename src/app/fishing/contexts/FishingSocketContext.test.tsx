// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { FishingSocketEvents } from '@/types/fishingSocket';

// 서버가 보내는 이벤트를 손으로 흘려 넣는 가짜 소켓
type Handler = (payload: unknown) => void;
const handlers = new Map<string, Handler>();
const fakeSocket = {
  connected: false,
  on: (event: string, handler: Handler) => {
    handlers.set(event, handler);
    return fakeSocket;
  },
  emit: vi.fn(),
  disconnect: vi.fn(),
};
vi.mock('socket.io-client', () => ({ io: () => fakeSocket }));
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { userId: 1, accessToken: 'token' } }, status: 'authenticated' }),
}));

import { FishingSocketProvider, useFishingSocketContext } from './FishingSocketContext';

function serverSends(event: string, payload: unknown) {
  act(() => handlers.get(event)?.(payload));
}

beforeEach(() => {
  vi.useFakeTimers();
  handlers.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('FishingSocketContext 다른 유저 위치 (B7)', () => {
  it('이동 이벤트는 컨텍스트를 쓰는 화면을 다시 그리지 않고 같은 Map에 반영된다 — 접속·퇴장은 다시 그린다', () => {
    let renders = 0;
    let latest: ReturnType<typeof useFishingSocketContext> | null = null;
    function Consumer() {
      renders++;
      latest = useFishingSocketContext();
      return null;
    }
    render(
      <FishingSocketProvider mapId="river">
        <Consumer />
      </FishingSocketProvider>,
    );
    // 연결 디바운스 뒤 소켓을 만든다
    act(() => {
      vi.advanceTimersByTime(300);
    });
    serverSends('connect', undefined);
    serverSends(FishingSocketEvents.USER_JOINED, { userId: 2, userName: '둘', connectionCount: 1, position: { x: 0, y: 0, direction: 'right' } });
    const players = latest!.otherPlayers;

    const before = renders;
    for (let i = 0; i < 30; i++) {
      serverSends(FishingSocketEvents.PLAYER_MOVED, { userId: 2, userName: '둘', x: 100 + i, y: 300, direction: 'right', timestamp: i });
    }
    // 예전엔 이동마다 새 Map → 30번 다시 그렸다
    expect(renders - before).toBe(0);
    expect(latest!.otherPlayers).toBe(players);
    expect(players.get(2)).toMatchObject({ targetX: 129, targetY: 300 });
    // 처음 받은 위치에서 보간을 시작한다(현재 위치는 그리기 루프가 옮긴다)
    expect(players.get(2)).toMatchObject({ x: 100, y: 300 });

    serverSends(FishingSocketEvents.PLAYER_FISHING_STATE, { userId: 2, state: 'casting', pointId: 'point-1' });
    expect(players.get(2)).toMatchObject({ fishingState: 'casting', pointId: 'point-1', targetX: 129 });

    // 퇴장 — 인원이 바뀌니 다시 그리고, 위치에서도 빠진다
    const beforeLeave = renders;
    serverSends(FishingSocketEvents.USER_LEFT, { userId: 2, connectionCount: 0 });
    expect(renders).toBeGreaterThan(beforeLeave);
    expect(latest!.onlineCount).toBe(0);
    expect(players.has(2)).toBe(false);
  });
});
