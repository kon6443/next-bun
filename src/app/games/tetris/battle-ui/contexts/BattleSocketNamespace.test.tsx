// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

const { urls } = vi.hoisted(() => ({ urls: [] as string[] }));
vi.mock('socket.io-client', () => ({
  io: (url: string) => {
    urls.push(url);
    const handlers = { on: () => {}, off: () => {} };
    return { ...handlers, io: handlers, connected: false, active: true, removeAllListeners: () => {}, disconnect: () => {} };
  },
}));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));

import { BattleSocketProvider } from './BattleSocketContext';

/** 공용 방 코어(F3b)로 옮긴 뒤에도 테트리스 대전은 같은 namespace로 붙는다 — 기존 Context 테스트는 연결 주소를 보지 않는다 */
describe('BattleSocketProvider namespace', () => {
  it('/tetris-battle로 연결한다', () => {
    render(<BattleSocketProvider>{null}</BattleSocketProvider>);
    expect(urls).toHaveLength(1);
    expect(urls[0].endsWith('/tetris-battle')).toBe(true);
  });
});
