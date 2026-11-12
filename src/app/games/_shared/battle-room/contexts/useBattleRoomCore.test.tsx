// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useState } from 'react';
import { act } from 'react';
import { useBattleRoomCore } from './useBattleRoomCore';

const { urls } = vi.hoisted(() => ({ urls: [] as string[] }));
vi.mock('socket.io-client', () => ({
  io: (url: string) => {
    urls.push(url);
    const handlers = { on: () => {}, off: () => {} };
    return { ...handlers, io: handlers, connected: false, active: true, removeAllListeners: () => {}, disconnect: () => {} };
  },
}));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));

let bump: () => void = () => {};

/** 게임 Provider가 config를 렌더마다 새로 만들어 넘기는 경우(인라인 객체·화살표) */
function InlineConfigProvider() {
  const [n, setN] = useState(0);
  bump = () => setN((v) => v + 1);
  useBattleRoomCore({
    namespace: '/fortress',
    sessions: { loadRoomSession: () => null, saveRoomSession: () => {}, clearRoomSession: () => {}, resetRoomSessionForTest: () => {} },
    errorMessage: (code) => `${code}${n}`,
  });
  return null;
}

describe('useBattleRoomCore config', () => {
  it('sessions·errorMessage가 렌더마다 바뀌어도 소켓을 다시 만들지 않는다', () => {
    render(<InlineConfigProvider />);
    act(() => bump());
    act(() => bump());
    expect(urls).toEqual(['/fortress']);
  });
});
