// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { StrictMode, useEffect, useRef, type ReactNode } from 'react';

/** 가짜 소켓 — on으로 등록한 핸들러를 직접 부르고, ack 요청은 handlers.ack에 맡긴다 */
type Listener = (...args: unknown[]) => void;
class FakeSocket {
  connected = false;
  /** 자동 재연결 중인지 (서버가 끊으면 false) */
  active = true;
  /** Manager 흉내 — 재시도 실패 이벤트만 쓴다 */
  managerListeners = new Map<string, Listener>();
  io = {
    on: (event: string, fn: Listener) => this.managerListeners.set(event, fn),
    off: (event: string, fn?: Listener) => {
      if (!fn || this.managerListeners.get(event) === fn) this.managerListeners.delete(event);
    },
  };
  connectCalls = 0;
  connect() {
    this.connectCalls += 1;
  }
  listeners = new Map<string, Listener[]>();
  emitted: { event: string; payload: unknown }[] = [];
  ack: (event: string, payload: unknown) => unknown = () => ({ ok: true, data: {} });
  auth: unknown;
  on(event: string, fn: Listener) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), fn]);
    return this;
  }
  removeAllListeners() {
    this.listeners.clear();
  }
  disconnect() {
    this.connected = false;
  }
  timeout() {
    return this;
  }
  /** connect 핸들러가 쓰는 콜백형 — (err, response) */
  emit(event: string, payload: unknown, callback?: (err: Error | null, response: unknown) => void) {
    this.emitted.push({ event, payload });
    callback?.(null, this.ack(event, payload));
  }
  emitWithAck(event: string, payload: unknown) {
    this.emitted.push({ event, payload });
    return Promise.resolve(this.ack(event, payload));
  }
  fire(event: string, ...args: unknown[]) {
    for (const fn of this.listeners.get(event) ?? []) fn(...args);
  }
}

const { sockets } = vi.hoisted(() => ({ sockets: [] as FakeSocket[] }));
vi.mock('socket.io-client', () => ({
  io: (_url: string, options: { auth: unknown }) => {
    const s = new FakeSocket();
    s.auth = options.auth;
    sockets.push(s);
    return s;
  },
}));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));

import { BattleSocketProvider, useBattleSocket, useEnterScope } from './BattleSocketContext';

const wrapper = ({ children }: { children: ReactNode }) => <BattleSocketProvider>{children}</BattleSocketProvider>;

const room = (code = 'ABC234') => ({
  code,
  name: '테스트 방',
  maxPlayers: 4,
  locked: false,
  hostId: 'p1',
  status: 'WAITING' as const,
  players: [{ playerId: 'p1', name: '나', ready: false, connected: true, isGuest: true }],
});

function connect(s: FakeSocket) {
  s.connected = true;
  act(() => s.fire('connect'));
}

describe('BattleSocketProvider', () => {
  beforeEach(() => {
    sockets.length = 0;
    window.sessionStorage.clear();
  });

  it('비로그인이면 토큰 없이 게스트로 연결한다', () => {
    renderHook(() => useBattleSocket(), { wrapper });
    expect(sockets).toHaveLength(1);
    expect(sockets[0].auth).toEqual({});
  });

  it('연결 전 요청은 DISCONNECTED로 실패하고 보내지 않는다', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    let response: unknown;
    await act(async () => {
      response = await result.current.listRooms();
    });
    expect(response).toEqual({ ok: false, code: 'DISCONNECTED' });
    expect(sockets[0].emitted).toHaveLength(0);
  });

  it('방 만들기 성공 → 방 상태·내 id, 재연결 토큰을 이 탭에 저장, 로비 목록은 비운다', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.ack = (event) =>
      event === 'listRooms'
        ? { ok: true, data: { rooms: [] } }
        : { ok: true, data: { room: room(), playerId: 'p1', playerToken: 'secret' } };
    await act(async () => {
      await result.current.listRooms();
    });
    expect(result.current.rooms).toEqual([]);
    await act(async () => {
      await result.current.createRoom({ name: '테스트 방', maxPlayers: 4, playerName: '나' });
    });
    expect(result.current.room?.code).toBe('ABC234');
    expect(result.current.myPlayerId).toBe('p1');
    expect(result.current.rooms).toBeNull();
    expect(JSON.parse(window.sessionStorage.getItem('tetris:battle:ABC234') ?? '{}')).toEqual({
      playerId: 'p1',
      playerToken: 'secret',
      playerName: '나',
    });
    // 로비 갱신은 방에 들어간 뒤엔 무시
    act(() => s.fire('roomsChanged', { rooms: [{ code: 'ZZZ222' }] }));
    expect(result.current.rooms).toBeNull();
  });

  it('소켓이 다시 붙으면 저장된 토큰으로 같은 방에 복귀한다', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 'secret' } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
    });
    s.emitted.length = 0;
    s.ack = () => ({ ok: true, data: { room: { ...room(), name: '복귀' }, playerId: 'p1', playerToken: 'secret2' } });
    act(() => s.fire('disconnect'));
    expect(result.current.status).toBe('disconnected');
    connect(s);
    expect(s.emitted).toEqual([{ event: 'joinRoom', payload: { code: 'ABC234', playerName: '나', playerToken: 'secret' } }]);
    await waitFor(() => expect(result.current.room?.name).toBe('복귀'));
    expect(JSON.parse(window.sessionStorage.getItem('tetris:battle:ABC234') ?? '{}').playerToken).toBe('secret2');
  });

  it('복귀 토큰이 만료됐으면 방에서 나간 상태로 돌아가고 저장값을 지운다', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 'secret' } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
    });
    s.ack = () => ({ ok: false, code: 'INVALID_PLAYER_TOKEN', message: 'expired' });
    connect(s);
    await waitFor(() => expect(result.current.room).toBeNull());
    expect(window.sessionStorage.getItem('tetris:battle:ABC234')).toBeNull();
  });

  it('roomState·채팅·이모트를 반영한다 — 다른 방의 상태는 무시', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 't' } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
    });
    act(() => s.fire('roomState', { ...room('OTHER2'), name: '남의 방' }));
    expect(result.current.room?.name).toBe('테스트 방');
    act(() => s.fire('roomState', { ...room(), name: '바뀐 이름' }));
    expect(result.current.room?.name).toBe('바뀐 이름');
    act(() => s.fire('chatMessage', { playerId: 'p2', name: '친구', text: '안녕', at: '2026-10-22T00:00:00Z' }));
    expect(result.current.chat.map((m) => m.text)).toEqual(['안녕']);
    act(() => s.fire('emoteReceived', { playerId: 'p2', emoteId: 'gg', at: '2026-10-22T00:00:00Z' }));
    const firstKey = result.current.emotes.p2.key;
    // 같은 이모트를 다시 받아도 key가 바뀌어 말풍선이 다시 뜬다
    act(() => s.fire('emoteReceived', { playerId: 'p2', emoteId: 'gg', at: '2026-10-22T00:00:01Z' }));
    expect(result.current.emotes.p2.key).not.toBe(firstKey);
  });

  it('화면을 떠난 뒤 늦게 온 입장 성공은 방에 들어가지 않고 곧바로 나간다 (유령 멤버 방지)', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    let resolveJoin: (value: unknown) => void = () => {};
    s.emitWithAck = (event: string, payload: unknown) => {
      s.emitted.push({ event, payload });
      if (event === 'joinRoom') return new Promise((resolve) => (resolveJoin = resolve));
      return Promise.resolve({ ok: true, data: {} });
    };
    const scope = { cancelled: false };
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.joinRoom({ code: 'ABC234', playerName: '나' }, scope);
    });
    scope.cancelled = true; // 요청한 화면이 내려갔다
    await act(async () => {
      resolveJoin({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 't' } });
      await pending;
    });
    expect(result.current.room).toBeNull();
    expect(s.emitted.map((e) => e.event)).toEqual(['joinRoom', 'leaveRoom']);
    expect(window.sessionStorage.getItem('tetris:battle:ABC234')).toBeNull();
  });

  it('재연결 복귀가 응답 없이 실패해도 방 밖으로 돌리고 안내를 남긴다 (저장값은 유지)', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 'secret' } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
    });
    s.emit = (event: string, payload: unknown, callback?: (err: Error | null, response: unknown) => void) => {
      s.emitted.push({ event, payload });
      callback?.(new Error('operation has timed out'), undefined);
    };
    connect(s);
    await waitFor(() => expect(result.current.room).toBeNull());
    // 같은 토큰으로 두 번 더 보낸 뒤에야 빠진다
    expect(s.emitted.filter((e) => e.event === 'joinRoom')).toHaveLength(1 + 3);
    expect(result.current.roomNotice).toEqual({ code: 'ABC234', message: expect.stringContaining('방에서 나왔어요') });
    expect(window.sessionStorage.getItem('tetris:battle:ABC234')).not.toBeNull();
  });

  it('재연결 복귀 응답이 한 번 없어도 같은 토큰으로 다시 보내 복귀한다', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 'secret' } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
    });
    let calls = 0;
    s.emit = (event: string, payload: unknown, callback?: (err: Error | null, response: unknown) => void) => {
      s.emitted.push({ event, payload });
      calls += 1;
      if (calls === 1) callback?.(new Error('operation has timed out'), undefined);
      else callback?.(null, { ok: true, data: { room: { ...room(), name: '복귀' }, playerId: 'p1', playerToken: 'secret' } });
    };
    connect(s);
    await waitFor(() => expect(result.current.room?.name).toBe('복귀'));
    expect(calls).toBe(2);
  });

  it('방 밖에서 온 채팅·이모트는 무시하고, 다른 방에 들어가면 이전 방 채팅을 비운다', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    act(() => s.fire('chatMessage', { playerId: 'p2', name: '남', text: '방 밖', at: 'x' }));
    expect(result.current.chat).toEqual([]);
    s.ack = (_e, payload) => ({
      ok: true,
      data: { room: room((payload as { code: string }).code), playerId: 'p1', playerToken: 't' },
    });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
    });
    act(() => s.fire('chatMessage', { playerId: 'p2', name: '친구', text: '첫 방', at: 'x' }));
    await act(async () => {
      await result.current.joinRoom({ code: 'DEF567', playerName: '나' });
    });
    expect(result.current.chat).toEqual([]);
  });

  it('자동 재시도를 다 쓰면 failed, reconnect로 다시 붙는다', () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    act(() => s.managerListeners.get('reconnect_failed')?.());
    expect(result.current.status).toBe('failed');
    act(() => result.current.reconnect());
    expect(s.connectCalls).toBe(1);
    expect(result.current.status).toBe('connecting');
  });

  it('입장 범위는 화면마다 따로 — 로비가 내려가는 같은 커밋의 방 화면 입장은 살고, StrictMode 이중 effect에도 살고, 방 화면을 떠나면 버린다', async () => {
    const resolvers: ((value: unknown) => void)[] = [];
    const seen: { ctx: ReturnType<typeof useBattleSocket> | null } = { ctx: null };
    /** 로비처럼 자기 범위만 가진 화면 */
    function Lobby() {
      seen.ctx = useBattleSocket();
      useEnterScope();
      return null;
    }
    /** 방 화면처럼 마운트 effect에서 1회 가드로 입장한다 */
    function Room() {
      const value = useBattleSocket();
      seen.ctx = value;
      const scope = useEnterScope();
      const triedRef = useRef(false);
      useEffect(() => {
        if (triedRef.current || value.status !== 'connected') return;
        triedRef.current = true;
        void value.joinRoom({ code: 'ABC234', playerName: '나' }, scope);
      }, [value, scope]);
      return null;
    }
    const tree = (screen: 'lobby' | 'room') => (
      <StrictMode>
        <BattleSocketProvider>{screen === 'lobby' ? <Lobby /> : <Room />}</BattleSocketProvider>
      </StrictMode>
    );
    const view = render(tree('lobby'));
    const s = sockets[sockets.length - 1];
    s.emitWithAck = (event: string, payload: unknown) => {
      s.emitted.push({ event, payload });
      if (event === 'joinRoom') return new Promise((resolve) => resolvers.push(resolve));
      return Promise.resolve({ ok: true, data: {} });
    };
    connect(s);
    // 로비 → 방: 로비 정리와 방 마운트(StrictMode 정리 → 재마운트 포함)가 같은 커밋
    view.rerender(tree('room'));
    await act(async () => {
      resolvers[0]?.({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 't' } });
    });
    expect(seen.ctx?.room?.code).toBe('ABC234');
    expect(s.emitted.map((e) => e.event)).toEqual(['joinRoom']);

    // 방에서 나간 뒤 방 화면이 다시 입장 요청 → 응답 전에 로비로 가면 늦은 성공은 버리고 나간다
    await act(async () => {
      await seen.ctx?.leaveRoom();
    });
    view.rerender(tree('lobby'));
    view.rerender(tree('room'));
    s.emitted.length = 0;
    view.rerender(tree('lobby'));
    await act(async () => {
      resolvers[resolvers.length - 1]?.({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 't' } });
    });
    expect(seen.ctx?.room).toBeNull();
    expect(s.emitted.map((e) => e.event)).toEqual(['leaveRoom']);
  });

  it('서버가 끊어 자동 재연결이 없으면 failed (수동 재연결 버튼)', () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.active = false;
    act(() => s.fire('disconnect'));
    expect(result.current.status).toBe('failed');
  });

  it('입장 응답의 매치 복구 데이터는 대전 화면이 등록할 때 넘긴다 (새로고침 재입장)', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    const rejoin = { match: { matchId: 'm1', seed: 1, status: 'PLAYING' as const, alive: true }, missedGarbage: [], opponents: [] };
    s.ack = () => ({ ok: true, data: { room: { ...room(), status: 'PLAYING' }, playerId: 'p1', playerToken: 't', rejoin } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나', playerToken: 't' });
    });
    const onRejoin = vi.fn();
    act(() => {
      result.current.registerMatchSync({ lastGarbageId: () => null, onRejoin });
    });
    expect(onRejoin).toHaveBeenCalledWith(rejoin);
  });

  it('재연결 복귀 joinRoom에 마지막 가비지 id를 싣고, 응답의 복구 데이터를 대전 화면에 넘긴다', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 'secret' } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
    });
    const onRejoin = vi.fn();
    act(() => {
      result.current.registerMatchSync({ lastGarbageId: () => 5, onRejoin });
    });
    const rejoin = { match: { matchId: 'm1', seed: 1, status: 'PLAYING' as const, alive: true }, missedGarbage: [], opponents: [] };
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 'secret2', rejoin } });
    s.emitted.length = 0;
    connect(s);
    expect(s.emitted[0]).toEqual({ event: 'joinRoom', payload: { code: 'ABC234', playerName: '나', playerToken: 'secret', lastGarbageId: 5 } });
    await waitFor(() => expect(onRejoin).toHaveBeenCalledWith(rejoin));
  });

  it('응답이 없으면(타임아웃) TIMEOUT', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.emitWithAck = () => Promise.reject(new Error('operation has timed out'));
    let response: unknown;
    await act(async () => {
      response = await result.current.listRooms();
    });
    expect(response).toEqual({ ok: false, code: 'TIMEOUT' });
  });
});
