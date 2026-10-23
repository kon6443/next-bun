// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
const { auth } = vi.hoisted(() => ({
  auth: { session: null as { data: { user: { accessToken: string } } | null; status: string } | null },
}));
vi.mock('next-auth/react', () => ({ useSession: () => auth.session ?? { data: null, status: 'unauthenticated' } }));

import {
  BattleSocketProvider,
  LEAVE_RETRY_DELAYS_MS,
  SEAT_IN_USE_RETRY_MS,
  SEAT_IN_USE_WAIT_MS,
  useBattleSocket,
  useEnterScope,
} from './BattleSocketContext';
import { resetRoomSessionForTest, saveRoomSession } from '../lib/roomSession';
import { getTabId } from '../lib/tabId';

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
    window.localStorage.clear();
    resetRoomSessionForTest();
    auth.session = null;
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

  it('방 만들기 성공 → 방 상태·내 id, 재연결 토큰을 이 브라우저에 저장, 로비 목록은 비운다', async () => {
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
    expect(JSON.parse(window.localStorage.getItem('tetris:battle:ABC234') ?? '{}')).toEqual({
      playerId: 'p1',
      playerToken: 'secret',
      playerName: '나',
      tabId: getTabId(),
      savedAt: expect.any(Number),
    });
    // 이 탭 식별자를 함께 보낸다 (D-007)
    expect(s.emitted.find((e) => e.event === 'createRoom')?.payload).toEqual(expect.objectContaining({ tabId: expect.any(String), heartbeat: true }));
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
    expect(s.emitted).toEqual([
      { event: 'joinRoom', payload: { code: 'ABC234', playerName: '나', playerToken: 'secret', tabId: expect.any(String), heartbeat: true } },
    ]);
    await waitFor(() => expect(result.current.room?.name).toBe('복귀'));
    expect(JSON.parse(window.localStorage.getItem('tetris:battle:ABC234') ?? '{}').playerToken).toBe('secret2');
    // 리플레이 제출 토큰도 이 탭이 받은 새 값
    expect(result.current.playerTokenFor('ABC234')).toBe('secret2');
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
    expect(window.localStorage.getItem('tetris:battle:ABC234')).toBeNull();
  });

  it('입장 응답 직후 렌더 전에 온 같은 방 roomState도 반영한다 (FE-12)', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 't' } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
      s.fire('roomState', { ...room(), name: '바로 바뀜' });
    });
    expect(result.current.room?.name).toBe('바로 바뀜');
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
    expect(window.localStorage.getItem('tetris:battle:ABC234')).toBeNull();
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
    expect(window.localStorage.getItem('tetris:battle:ABC234')).not.toBeNull();
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
    expect(s.emitted[0]).toEqual({
      event: 'joinRoom',
      payload: { code: 'ABC234', playerName: '나', playerToken: 'secret', tabId: expect.any(String), heartbeat: true, lastGarbageId: 5 },
    });
    await waitFor(() => expect(onRejoin).toHaveBeenCalledWith(rejoin));
  });

  it('다른 탭·기기가 자리를 넘겨받으면 방 밖으로 돌리고, 저장값은 두고, 다시 붙어도 되찾지 않는다', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 'secret' } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
    });
    act(() => s.fire('sessionReplaced', { code: 'OTHER2' }));
    expect(result.current.room?.code).toBe('ABC234');
    act(() => s.fire('sessionReplaced', { code: 'ABC234' }));
    expect(result.current.room).toBeNull();
    expect(result.current.roomNotice).toEqual({ code: 'ABC234', message: expect.any(String), replaced: true });
    expect(window.localStorage.getItem('tetris:battle:ABC234')).not.toBeNull();
    s.emitted.length = 0;
    connect(s);
    expect(s.emitted).toEqual([]);
  });

  it('나가기는 그 탭이 쓰던 토큰일 때만 저장값을 지운다 — 다른 탭이 새로 저장한 토큰은 그대로, 제출 토큰은 이 탭 값', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 'mine' } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
    });
    // 같은 브라우저의 다른 탭이 같은 방에 들어가 새 토큰을 저장했다
    window.localStorage.setItem(
      'tetris:battle:ABC234',
      JSON.stringify({ playerId: 'p1', playerToken: 'theirs', playerName: '나', savedAt: Date.now() }),
    );
    expect(result.current.playerTokenFor('ABC234')).toBe('mine');
    expect(result.current.playerTokenFor('OTHER2')).toBeNull();
    await act(async () => {
      await result.current.leaveRoom();
    });
    expect(JSON.parse(window.localStorage.getItem('tetris:battle:ABC234') ?? '{}').playerToken).toBe('theirs');
  });

  it('무효 토큰이 아니어도 방이 없어졌으면(ROOM_NOT_FOUND) 그 토큰의 저장값을 지운다', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    window.localStorage.setItem(
      'tetris:battle:ABC234',
      JSON.stringify({ playerId: 'p1', playerToken: 'old', playerName: '나', savedAt: Date.now() }),
    );
    s.ack = () => ({ ok: false, code: 'ROOM_NOT_FOUND', message: 'gone' });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나', playerToken: 'old' });
    });
    expect(window.localStorage.getItem('tetris:battle:ABC234')).toBeNull();
  });

  it('끊긴 사이 같은 브라우저의 다른 탭이 이 자리에 들어갔으면 다시 붙어도 되찾지 않는다', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 'secret' } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
    });
    act(() => s.fire('disconnect'));
    // 다른 탭이 같은 토큰으로 넘겨받아 마지막으로 저장했다 (이 탭 소켓은 끊겨 넘겨받힘 알림을 못 받았다)
    saveRoomSession('ABC234', { playerId: 'p1', playerToken: 'secret', playerName: '나', tabId: 'other-tab' });
    s.emitted.length = 0;
    connect(s);
    expect(s.emitted).toEqual([]);
    expect(result.current.room).toBeNull();
    expect(result.current.roomNotice).toEqual(expect.objectContaining({ code: 'ABC234', replaced: true }));
  });

  it('다른 탭이 마지막으로 저장한 값이 다른 자리(다른 토큰)면 이 탭 자리로 복귀한다', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 'mine' } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
    });
    saveRoomSession('ABC234', { playerId: 'p2', playerToken: 'theirs', playerName: '나', tabId: 'other-tab' });
    s.emitted.length = 0;
    connect(s);
    expect(s.emitted[0]?.payload).toEqual(expect.objectContaining({ playerToken: 'mine' }));
  });

  it('재연결 복귀는 이 탭이 받은 토큰으로 — 저장값이 지워졌어도 복귀를 시도한다', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 'mine' } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
    });
    window.localStorage.clear();
    s.emitted.length = 0;
    connect(s);
    expect(s.emitted[0]?.payload).toEqual(expect.objectContaining({ playerToken: 'mine', playerName: '나' }));
    await waitFor(() => expect(result.current.room?.code).toBe('ABC234'));
  });

  it('나가기가 NOT_IN_ROOM이면(다른 탭이 넘겨받음) 저장값을 남긴다', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 'secret' } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
    });
    s.ack = (event) => (event === 'leaveRoom' ? { ok: false, code: 'NOT_IN_ROOM', message: 'x' } : { ok: true, data: {} });
    await act(async () => {
      await result.current.leaveRoom();
    });
    expect(window.localStorage.getItem('tetris:battle:ABC234')).not.toBeNull();
    s.ack = () => ({ ok: true, data: {} });
  });

  it('로그인이 바뀌어 소켓만 바꿀 때는 방을 나가지 않고 새 소켓이 토큰으로 복귀한다', async () => {
    const { result, rerender } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 'secret' } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
    });
    s.emitted.length = 0;
    auth.session = { data: { user: { accessToken: 'jwt' } }, status: 'authenticated' };
    rerender();
    expect(s.emitted).toEqual([]);
    expect(sockets).toHaveLength(2);
    const next = sockets[1];
    next.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 'secret' } });
    connect(next);
    expect(next.emitted[0]).toEqual(expect.objectContaining({ event: 'joinRoom' }));
    expect(window.localStorage.getItem('tetris:battle:ABC234')).not.toBeNull();
  });

  it('접속 확인(presencePing)에 방 안이면 곧바로 heartbeat로 답하고, 방 밖이면 답하지 않는다 (D-012)', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    act(() => s.fire('presencePing'));
    expect(s.emitted.filter((e) => e.event === 'heartbeat')).toHaveLength(0);
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 't' } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
    });
    act(() => s.fire('presencePing'));
    expect(s.emitted.filter((e) => e.event === 'heartbeat')).toEqual([{ event: 'heartbeat', payload: { code: 'ABC234' } }]);
  });

  it('방장이 내보내면(kicked) 방 밖으로, 토큰을 지우고, 안내는 kicked — 다시 붙어도 복귀하지 않는다 (D-011)', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p2', playerToken: 'secret' } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
    });
    act(() => s.fire('kicked', { code: 'ABC234' }));
    expect(result.current.room).toBeNull();
    expect(result.current.roomNotice).toEqual(expect.objectContaining({ code: 'ABC234', kicked: true }));
    expect(window.localStorage.getItem('tetris:battle:ABC234')).toBeNull();
    s.emitted.length = 0;
    connect(s);
    expect(s.emitted).toEqual([]);
  });

  it('방장 내보내기는 kickPlayer { code, playerId }', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 't' } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
    });
    s.ack = () => ({ ok: true, data: {} });
    await act(async () => {
      await result.current.kickPlayer('p2');
    });
    expect(s.emitted.at(-1)).toEqual({ event: 'kickPlayer', payload: { code: 'ABC234', playerId: 'p2' } });
  });

  it('방 안 요청이 NOT_IN_ROOM이면(서버가 이 소켓을 뗐다) 토큰 복귀를 한 번 — 복귀 중에 또 받아도 겹쳐 보내지 않는다', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 'secret' } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
    });
    s.ack = (event) => (event === 'setReady' ? { ok: false, code: 'NOT_IN_ROOM', message: 'x' } : { ok: true, data: {} });
    // 복귀 응답을 붙잡아 둔다
    let rejoinCallback: ((err: Error | null, response: unknown) => void) | undefined;
    s.emit = (event: string, payload: unknown, callback?: (err: Error | null, response: unknown) => void) => {
      s.emitted.push({ event, payload });
      if (event === 'joinRoom') rejoinCallback = callback;
    };
    s.emitted.length = 0;
    await act(async () => {
      await result.current.setReady(true);
      await result.current.setReady(true);
    });
    expect(s.emitted.filter((e) => e.event === 'joinRoom')).toHaveLength(1);
    expect(s.emitted.find((e) => e.event === 'joinRoom')?.payload).toEqual(expect.objectContaining({ playerToken: 'secret' }));
    act(() => rejoinCallback?.(null, { ok: true, data: { room: { ...room(), name: '복귀' }, playerId: 'p1', playerToken: 'secret' } }));
    expect(result.current.room?.name).toBe('복귀');
  });

  it('SEAT_IN_USE 자동 입장은 일정 간격으로 다시 묻고(기다리기 시작을 한 번 알림) 한도가 지나면 그만둔다', async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useBattleSocket(), { wrapper });
      const s = sockets[0];
      connect(s);
      s.ack = () => ({ ok: false, code: 'SEAT_IN_USE', message: 'in use' });
      const onSeatWait = vi.fn();
      let response: unknown;
      act(() => {
        void result.current
          .joinRoom({ code: 'ABC234', playerName: '나', playerToken: 't' }, undefined, { retrySeatInUse: true, onSeatWait })
          .then((r) => (response = r));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SEAT_IN_USE_WAIT_MS + SEAT_IN_USE_RETRY_MS);
      });
      expect(response).toEqual({ ok: false, code: 'SEAT_IN_USE' });
      expect(onSeatWait).toHaveBeenCalledTimes(1);
      // 한도 안에서만 — 마지막 재시도도 한도를 넘지 않는다
      expect(s.emitted.filter((e) => e.event === 'joinRoom')).toHaveLength(1 + Math.floor(SEAT_IN_USE_WAIT_MS / SEAT_IN_USE_RETRY_MS));
    } finally {
      vi.useRealTimers();
    }
  });

  it('서버가 끊으면(io server disconnect — 하트비트 만료) 직접 다시 붙고 방에 복귀한다, 곧바로 또 끊으면 수동 재연결로', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 'secret' } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
    });
    s.active = false;
    s.connected = false;
    act(() => s.fire('disconnect', 'io server disconnect'));
    expect(s.connectCalls).toBe(1);
    expect(result.current.status).toBe('connecting');
    s.emitted.length = 0;
    connect(s);
    expect(s.emitted[0]).toEqual(expect.objectContaining({ event: 'joinRoom' }));
    s.connected = false;
    act(() => s.fire('disconnect', 'io server disconnect'));
    expect(s.connectCalls).toBe(1);
    expect(result.current.status).toBe('failed');
  });

  it('재연결 복귀가 SEAT_IN_USE면(다른 탭·기기가 경기 중) 넘겨받힘처럼 안내하고 자동으로 되찾지 않는다', async () => {
    const { result } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 'secret' } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
    });
    s.ack = () => ({ ok: false, code: 'SEAT_IN_USE', message: 'in use' });
    connect(s);
    await waitFor(() => expect(result.current.room).toBeNull());
    expect(result.current.roomNotice).toEqual(expect.objectContaining({ code: 'ABC234', replaced: true }));
  });

  describe('나가기 실패 (FE-25)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    async function inRoom() {
      const view = renderHook(() => useBattleSocket(), { wrapper });
      const s = sockets[0];
      connect(s);
      s.ack = (_e, payload) => ({
        ok: true,
        data: { room: room((payload as { code: string }).code), playerId: 'p1', playerToken: 't' },
      });
      await act(async () => {
        await view.result.current.joinRoom({ code: 'ABC234', playerName: '나' });
      });
      return { ...view, s };
    }

    it('일시 실패면 다시 보내 성공하면 끝', async () => {
      const { result, s } = await inRoom();
      let leaves = 0;
      s.ack = (event) => (event === 'leaveRoom' && ++leaves === 1 ? { ok: false, code: 'ROOM_BUSY', message: 'busy' } : { ok: true, data: {} });
      let done: Promise<void> = Promise.resolve();
      act(() => {
        done = result.current.leaveRoom();
      });
      expect(result.current.room).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LEAVE_RETRY_DELAYS_MS[0]);
        await done;
      });
      expect(leaves).toBe(2);
      expect(s.connectCalls).toBe(0);
    });

    it('끝내 실패하면 소켓을 다시 붙여 서버가 끊김으로 정리하게 한다 — 방에 복귀하지는 않는다', async () => {
      const { result, s } = await inRoom();
      s.ack = (event) => (event === 'leaveRoom' ? { ok: false, code: 'SERVICE_UNAVAILABLE', message: 'down' } : { ok: true, data: {} });
      let done: Promise<void> = Promise.resolve();
      act(() => {
        done = result.current.leaveRoom();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LEAVE_RETRY_DELAYS_MS[0] + LEAVE_RETRY_DELAYS_MS[1]);
        await done;
      });
      expect(s.emitted.filter((e) => e.event === 'leaveRoom')).toHaveLength(3);
      expect(s.connected).toBe(false);
      expect(s.connectCalls).toBe(1);
      // 직접 나갔으니 유예 안에 링크로 돌아와도 그 자리로 복귀하지 않게 저장값을 지운다
      expect(window.localStorage.getItem('tetris:battle:ABC234')).toBeNull();
      s.emitted.length = 0;
      connect(s);
      expect(s.emitted.filter((e) => e.event === 'joinRoom')).toHaveLength(0);
    });

    it('다시 보내기 전에 다른 방에 들어갔으면 멈춘다 — 다시 붙여 새 자리를 끊지 않는다', async () => {
      const { result, s } = await inRoom();
      s.ack = (event, payload) =>
        event === 'leaveRoom'
          ? { ok: false, code: 'ROOM_BUSY', message: 'busy' }
          : { ok: true, data: { room: room((payload as { code: string }).code), playerId: 'p1', playerToken: 't2' } };
      let done: Promise<void> = Promise.resolve();
      act(() => {
        done = result.current.leaveRoom();
      });
      await act(async () => {
        await result.current.joinRoom({ code: 'DEF567', playerName: '나' });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LEAVE_RETRY_DELAYS_MS[0] + LEAVE_RETRY_DELAYS_MS[1]);
        await done;
      });
      expect(s.emitted.filter((e) => e.event === 'leaveRoom')).toHaveLength(1);
      expect(s.connectCalls).toBe(0);
      expect(result.current.room?.code).toBe('DEF567');
    });

    it('다시 보내기를 기다리는 사이 같은 방에 같은 토큰으로 다시 들어가면 그 토큰을 지우지 않는다', async () => {
      const { result, s } = await inRoom();
      s.ack = (event, payload) =>
        event === 'leaveRoom'
          ? { ok: false, code: 'ROOM_BUSY', message: 'busy' }
          : { ok: true, data: { room: room((payload as { code: string }).code), playerId: 'p1', playerToken: 't' } };
      let done: Promise<void> = Promise.resolve();
      act(() => {
        done = result.current.leaveRoom();
      });
      await act(async () => {
        await result.current.joinRoom({ code: 'ABC234', playerName: '나', playerToken: 't' });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LEAVE_RETRY_DELAYS_MS[0] + LEAVE_RETRY_DELAYS_MS[1]);
        await done;
      });
      expect(result.current.room?.code).toBe('ABC234');
      expect(JSON.parse(window.localStorage.getItem('tetris:battle:ABC234') ?? '{}').playerToken).toBe('t');
      expect(s.connectCalls).toBe(0);
    });

    it('다시 보내도 안 되는 실패면 곧바로 소켓을 다시 붙인다', async () => {
      const { result, s } = await inRoom();
      s.ack = (event) => (event === 'leaveRoom' ? { ok: false, code: 'INVALID_PAYLOAD', message: 'bad' } : { ok: true, data: {} });
      await act(async () => {
        await result.current.leaveRoom();
      });
      expect(s.emitted.filter((e) => e.event === 'leaveRoom')).toHaveLength(1);
      expect(s.connectCalls).toBe(1);
    });

    it('방 만들기가 진행 중이면 다시 보내기를 멈춘다', async () => {
      const { result, s } = await inRoom();
      let resolveCreate: (value: unknown) => void = () => {};
      s.emitWithAck = (event: string, payload: unknown) => {
        s.emitted.push({ event, payload });
        if (event === 'createRoom') return new Promise((resolve) => (resolveCreate = resolve));
        return Promise.resolve({ ok: false, code: 'ROOM_BUSY', message: 'busy' });
      };
      let done: Promise<void> = Promise.resolve();
      act(() => {
        done = result.current.leaveRoom();
      });
      let creating: Promise<unknown> = Promise.resolve();
      act(() => {
        creating = result.current.createRoom({ name: '새 방', maxPlayers: 4, playerName: '나' });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LEAVE_RETRY_DELAYS_MS[0] + LEAVE_RETRY_DELAYS_MS[1]);
        await done;
      });
      expect(s.emitted.filter((e) => e.event === 'leaveRoom')).toHaveLength(1);
      expect(s.connectCalls).toBe(0);
      await act(async () => {
        resolveCreate({ ok: true, data: { room: room('NEW222'), playerId: 'p1', playerToken: 'n' } });
        await creating;
      });
    });

    it('자동 입장이 SEAT_IN_USE로 기다리는 동안도 입장 중이다 — 나가기 재시도가 소켓을 끊지 않는다', async () => {
      const { result, s } = await inRoom();
      let joins = 0;
      s.ack = (event, payload) => {
        if (event === 'leaveRoom') return { ok: false, code: 'ROOM_BUSY', message: 'busy' };
        joins += 1;
        return joins === 1
          ? { ok: false, code: 'SEAT_IN_USE', message: 'in use' }
          : { ok: true, data: { room: room((payload as { code: string }).code), playerId: 'p1', playerToken: 'y' } };
      };
      let done: Promise<void> = Promise.resolve();
      act(() => {
        done = result.current.leaveRoom();
      });
      let joining: Promise<unknown> = Promise.resolve();
      act(() => {
        joining = result.current.joinRoom({ code: 'DEF567', playerName: '나', playerToken: 'y' }, undefined, { retrySeatInUse: true });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SEAT_IN_USE_RETRY_MS);
        await joining;
        await done;
      });
      expect(joins).toBe(2);
      expect(s.connectCalls).toBe(0);
      expect(result.current.room?.code).toBe('DEF567');
    });
  });

  it('대전 화면을 떠나면(provider 언마운트) 방에서 나간다 — 나간 것이 확인되지 않아 저장값은 둔다', async () => {
    const { result, unmount } = renderHook(() => useBattleSocket(), { wrapper });
    const s = sockets[0];
    connect(s);
    s.ack = () => ({ ok: true, data: { room: room(), playerId: 'p1', playerToken: 'secret' } });
    await act(async () => {
      await result.current.joinRoom({ code: 'ABC234', playerName: '나' });
    });
    s.emitted.length = 0;
    unmount();
    expect(s.emitted).toEqual([{ event: 'leaveRoom', payload: { code: 'ABC234' } }]);
    expect(window.localStorage.getItem('tetris:battle:ABC234')).not.toBeNull();
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
