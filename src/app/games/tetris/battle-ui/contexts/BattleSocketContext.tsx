'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { io } from 'socket.io-client';
import {
  type ChatMessagePayload,
  type CreateRoomPayload,
  type EmoteReceivedPayload,
  type EnterRoomAckData,
  type JoinRoomPayload,
  type RejoinData,
  type RoomState,
  type RoomSummary,
  TETRIS_BATTLE_NAMESPACE,
  type TetrisBattleAck,
  TetrisBattleClientEvents,
  TetrisBattleErrorCodes,
  TetrisBattleServerEvents,
  type TetrisBattleSocket,
  type TetrisBattleEmoteId,
} from '@/types/tetrisBattleSocket';
import { type BattleRequestErrorCode, battleErrorMessage } from '../lib/battleErrors';
import { clearRoomSession, loadRoomSession, saveRoomSession } from '../lib/roomSession';

const SOCKET_URL = process.env.NEXT_PUBLIC_API ?? '';

/** 재연결 복귀 joinRoom 응답이 없을 때 같은 소켓에서 다시 보내는 횟수 — 토큰 재입장은 토큰을 그대로 돌려줘 몇 번이고 안전하다 */
const REJOIN_RETRIES = 2;

const SOCKET_CONFIG = {
  reconnectAttempts: 10,
  reconnectDelay: 1000,
  timeout: 10000,
  /** ack 응답 대기 */
  ackTimeout: 8000,
} as const;

/** 대기실 채팅은 입장 후 받은 것만 — 최근 이만큼만 둔다 */
const CHAT_LIMIT = 50;

export type BattleResult<T> = { ok: true; data: T } | { ok: false; code: BattleRequestErrorCode };

/** failed = 자동 재시도가 모두 끝남(수동 reconnect 필요) */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'failed';

export type ReceivedEmote = EmoteReceivedPayload & { key: number };

/** 입장 요청을 낸 화면의 범위 — 화면을 떠나면 cancelled가 되고, 그 뒤 도착한 성공 응답은 버리고 곧바로 나간다 */
export type EnterScope = { cancelled: boolean };

/** 재연결 복귀 실패 안내 — 그 방 화면에서만 보인다 */
export type RoomNotice = { code: string; message: string };

/** 진행 중인 매치와 재연결을 잇는다 — 대전 화면(useBattleMatch)이 등록한다 */
export type MatchSync = {
  /** 마지막으로 받아들인 가비지 id — 재연결 joinRoom에 실어 놓친 것만 받는다 */
  lastGarbageId: () => number | null;
  /** 재연결 joinRoom 응답의 복구 데이터 */
  onRejoin: (rejoin: RejoinData | undefined) => void;
};
export type ReceivedChat = ChatMessagePayload & { key: number };

type BattleSocketContextValue = {
  socket: TetrisBattleSocket | null;
  status: ConnectionStatus;
  /** 로비 방 목록 — 로비 구독 전이면 null */
  rooms: RoomSummary[] | null;
  /** 들어가 있는 방 */
  room: RoomState | null;
  myPlayerId: string | null;
  chat: ReceivedChat[];
  /** 플레이어별 마지막 이모트 */
  emotes: Record<string, ReceivedEmote>;
  /** 재연결 복귀에 실패해 방에서 빠졌을 때의 안내 — 다시 들어가면 지워진다 */
  roomNotice: RoomNotice | null;
  reconnect: () => void;
  listRooms: () => Promise<BattleResult<RoomSummary[]>>;
  createRoom: (payload: CreateRoomPayload, scope?: EnterScope) => Promise<BattleResult<EnterRoomAckData>>;
  joinRoom: (payload: JoinRoomPayload, scope?: EnterScope) => Promise<BattleResult<EnterRoomAckData>>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<BattleResult<unknown>>;
  /** 방장 — 매치 시작 */
  startMatch: () => Promise<BattleResult<unknown>>;
  /** 방장 — 결과 화면에서 같은 방으로 재대결(대기실로) */
  rematch: () => Promise<BattleResult<unknown>>;
  /** 매치 화면이 재연결 복구를 받으려고 등록한다 — 해제 함수를 돌려준다 */
  registerMatchSync: (sync: MatchSync) => () => void;
  sendChat: (text: string) => Promise<BattleResult<unknown>>;
  sendEmote: (emoteId: TetrisBattleEmoteId) => Promise<BattleResult<unknown>>;
};

const BattleSocketContext = createContext<BattleSocketContextValue | null>(null);

/**
 * 테트리스 대전 소켓 — 로비·방 화면이 함께 쓴다(대전 경로 layout에 둬서 로비 → 방 이동 중 연결이 유지된다)
 * 로그인이면 토큰으로, 아니면 게스트로 연결한다(낚시와 같은 방식). 소켓이 다시 붙으면 들어가 있던 방에 토큰으로 복귀한다
 * 채팅·이모트는 서버가 보낸 사람에게도 돌려주므로 미리 넣지 않고 받은 것만 표시한다(중복 없음)
 */
export function BattleSocketProvider({ children }: { children: ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
  const accessToken = session?.user?.accessToken;

  const [socket, setSocket] = useState<TetrisBattleSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [chat, setChat] = useState<ReceivedChat[]>([]);
  const [emotes, setEmotes] = useState<Record<string, ReceivedEmote>>({});
  const [roomNotice, setRoomNotice] = useState<RoomNotice | null>(null);

  const socketRef = useRef<TetrisBattleSocket | null>(null);
  const roomRef = useRef<RoomState | null>(null);
  roomRef.current = room;
  /** 로비를 보고 있는지 — 방에 들어간 뒤 온 목록 갱신은 무시한다 */
  const lobbyRef = useRef(false);
  const keyRef = useRef(0);
  /** 방 코드별 진행 중인 joinRoom 수 — 같은 방 입장이 진행 중이면 버린 입장의 늦은 leave를 보내지 않는다(서버는 소켓 요청을 도착 순서대로 처리) */
  const inflightJoinsRef = useRef(new Map<string, number>());
  const matchSyncRef = useRef<MatchSync | null>(null);
  /** 입장 응답의 복구 데이터를 대전 화면이 아직 등록하기 전에 받았을 때(새로고침 재입장) 맡아 둔다 */
  const pendingRejoinRef = useRef<RejoinData | null>(null);

  const resetRoom = useCallback(() => {
    pendingRejoinRef.current = null;
    setRoom(null);
    setMyPlayerId(null);
    setChat([]);
    setEmotes({});
  }, []);

  /** ack 요청 — 연결이 없거나 응답이 없으면 클라이언트 코드로 실패 */
  const request = useCallback(
    async <T,>(emit: (s: TetrisBattleSocket) => Promise<TetrisBattleAck<T>>): Promise<BattleResult<T>> => {
      const s = socketRef.current;
      if (!s || !s.connected) return { ok: false, code: 'DISCONNECTED' };
      try {
        const response = await emit(s.timeout(SOCKET_CONFIG.ackTimeout) as TetrisBattleSocket);
        return response.ok ? { ok: true, data: response.data } : { ok: false, code: response.code };
      } catch {
        return { ok: false, code: 'TIMEOUT' };
      }
    },
    [],
  );

  const enterRoom = useCallback((data: EnterRoomAckData, playerName: string) => {
    lobbyRef.current = false;
    setRooms(null);
    // 다른 방으로 바뀌면 이전 방의 채팅·이모트를 비운다 (playerId는 방마다 다시 쓰인다)
    if (roomRef.current?.code !== data.room.code) {
      setChat([]);
      setEmotes({});
    }
    setRoom(data.room);
    setMyPlayerId(data.playerId);
    setRoomNotice(null);
    saveRoomSession(data.room.code, { playerId: data.playerId, playerToken: data.playerToken, playerName });
  }, []);

  // ===== 연결 =====

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    const s = io(`${SOCKET_URL}${TETRIS_BATTLE_NAMESPACE}`, {
      transports: ['websocket', 'polling'],
      auth: accessToken ? { token: accessToken } : {},
      reconnection: true,
      reconnectionAttempts: SOCKET_CONFIG.reconnectAttempts,
      reconnectionDelay: SOCKET_CONFIG.reconnectDelay,
      timeout: SOCKET_CONFIG.timeout,
      closeOnBeforeunload: true,
    }) as TetrisBattleSocket;
    socketRef.current = s;
    setSocket(s);
    setStatus('connecting');

    /** 복귀 실패 — 화면을 방 밖으로 돌리고 이유를 남긴다. 토큰이 무효인 경우만 저장값을 지운다 */
    const dropRoom = (code: string, reason: BattleRequestErrorCode | null) => {
      if (reason === TetrisBattleErrorCodes.INVALID_PLAYER_TOKEN || reason === TetrisBattleErrorCodes.ROOM_NOT_FOUND) {
        clearRoomSession(code);
      }
      resetRoom();
      setRoomNotice({
        code,
        message:
          reason === TetrisBattleErrorCodes.ROOM_NOT_FOUND
            ? '방이 없어졌어요.'
            : `연결이 끊긴 사이 방에서 나왔어요. ${reason ? battleErrorMessage(reason) : '다시 입장해 주세요.'}`,
      });
    };

    s.on('connect', () => {
      setStatus('connected');
      // 다시 붙었으면 들어가 있던 방에 토큰으로 복귀한다 (로비 목록 재구독은 로비 화면이 연결 상태를 보고 한다)
      const current = roomRef.current;
      if (!current) return;
      const saved = loadRoomSession(current.code);
      if (!saved) {
        dropRoom(current.code, null);
        return;
      }
      const attempt = (retriesLeft: number) => {
        const lastGarbageId = matchSyncRef.current?.lastGarbageId() ?? null;
        s.timeout(SOCKET_CONFIG.ackTimeout).emit(
          TetrisBattleClientEvents.JOIN_ROOM,
          {
            code: current.code,
            playerName: saved.playerName,
            playerToken: saved.playerToken,
            ...(lastGarbageId !== null ? { lastGarbageId } : {}),
          },
          (err: Error | null, response?: TetrisBattleAck<EnterRoomAckData>) => {
            onRejoinAck(retriesLeft, err, response);
          },
        );
      };
      const onRejoinAck = (retriesLeft: number, err: Error | null, response?: TetrisBattleAck<EnterRoomAckData>) => {
        if (roomRef.current?.code !== current.code) return; // 그사이 나갔다
        if (err || !response) {
          // 응답 없음 — 지금 이 소켓이 연결돼 있으면 같은 토큰으로 다시(다른 소켓이 생겼으면 그쪽 connect가 맡는다)
          if (retriesLeft > 0 && socketRef.current === s && s.connected) attempt(retriesLeft - 1);
          else if (socketRef.current === s && s.connected) dropRoom(current.code, 'TIMEOUT');
        } else if (response.ok) {
          setRoom(response.data.room);
          setMyPlayerId(response.data.playerId);
          saveRoomSession(current.code, { ...saved, playerToken: response.data.playerToken });
          matchSyncRef.current?.onRejoin(response.data.rejoin);
        } else {
          dropRoom(current.code, response.code);
        }
      };
      attempt(REJOIN_RETRIES);
    });
    // 서버가 끊었거나 연결을 거부하면 socket.io가 다시 시도하지 않는다(active=false) — 수동 재연결로
    s.on('disconnect', () => setStatus(s.active ? 'disconnected' : 'failed'));
    s.on('connect_error', () => setStatus(s.active ? 'disconnected' : 'failed'));
    // 자동 재시도를 다 쓰면 수동으로만 다시 붙는다 (Manager는 다른 namespace 소켓과 공유될 수 있어 이 핸들러만 뗀다)
    const onReconnectFailed = () => setStatus('failed');
    s.io.on('reconnect_failed', onReconnectFailed);

    s.on(TetrisBattleServerEvents.ROOMS_CHANGED, (payload) => {
      if (lobbyRef.current) setRooms(payload.rooms);
    });
    s.on(TetrisBattleServerEvents.ROOM_STATE, (payload) => {
      if (roomRef.current?.code === payload.code) setRoom(payload);
    });
    s.on(TetrisBattleServerEvents.CHAT_MESSAGE, (payload) => {
      if (!roomRef.current) return;
      setChat((prev) => [...prev, { ...payload, key: ++keyRef.current }].slice(-CHAT_LIMIT));
    });
    s.on(TetrisBattleServerEvents.EMOTE_RECEIVED, (payload) => {
      if (!roomRef.current) return;
      const key = ++keyRef.current;
      setEmotes((prev) => ({ ...prev, [payload.playerId]: { ...payload, key } }));
    });

    return () => {
      s.removeAllListeners();
      s.io.off('reconnect_failed', onReconnectFailed);
      s.disconnect();
      if (socketRef.current === s) socketRef.current = null;
      setSocket(null);
    };
  }, [accessToken, sessionStatus, resetRoom]);

  const reconnect = useCallback(() => {
    const s = socketRef.current;
    if (!s || s.connected) return;
    setStatus('connecting');
    s.connect();
  }, []);

  // ===== 요청 =====

  const listRooms = useCallback(async () => {
    lobbyRef.current = true;
    const result = await request((s) => s.emitWithAck(TetrisBattleClientEvents.LIST_ROOMS, {}));
    if (!result.ok) return result;
    if (lobbyRef.current) setRooms(result.data.rooms);
    return { ok: true as const, data: result.data.rooms };
  }, [request]);

  /** 입장 응답 처리 — 요청한 화면을 이미 떠났으면 들어가지 않고 곧바로 나간다 */
  const settleEnter = useCallback(
    (scope: EnterScope | undefined, result: BattleResult<EnterRoomAckData>, playerName: string) => {
      if (!result.ok) return result;
      if (scope?.cancelled) {
        const code = result.data.room.code;
        // 그 방에 이미 다시 들어갔거나 같은 방 입장이 진행 중이면 leave를 보내지 않는다 — 늦은 leave가 새 자리를 지운다
        const superseded = roomRef.current?.code === code || (inflightJoinsRef.current.get(code) ?? 0) > 0;
        if (!superseded) {
          clearRoomSession(code);
          void request((s) => s.emitWithAck(TetrisBattleClientEvents.LEAVE_ROOM, { code }));
        }
        return { ok: false as const, code: 'DISCONNECTED' as const };
      }
      enterRoom(result.data, playerName);
      // 토큰 재입장(새로고침)에서 매치가 진행 중이면 대전 화면에 넘긴다 — 아직 등록 전이면 등록할 때
      if (result.data.rejoin) {
        if (matchSyncRef.current) matchSyncRef.current.onRejoin(result.data.rejoin);
        else pendingRejoinRef.current = result.data.rejoin;
      }
      return result;
    },
    [enterRoom, request],
  );

  const createRoom = useCallback(
    async (payload: CreateRoomPayload, scope?: EnterScope) => {
      const result = await request((s) => s.emitWithAck(TetrisBattleClientEvents.CREATE_ROOM, payload));
      return settleEnter(scope, result, payload.playerName);
    },
    [request, settleEnter],
  );

  const joinRoom = useCallback(
    async (payload: JoinRoomPayload, scope?: EnterScope) => {
      const inflight = inflightJoinsRef.current;
      inflight.set(payload.code, (inflight.get(payload.code) ?? 0) + 1);
      const result = await request((s) => s.emitWithAck(TetrisBattleClientEvents.JOIN_ROOM, payload));
      const left = (inflight.get(payload.code) ?? 1) - 1;
      if (left > 0) inflight.set(payload.code, left);
      else inflight.delete(payload.code);
      if (!result.ok && payload.playerToken && result.code === TetrisBattleErrorCodes.INVALID_PLAYER_TOKEN) {
        clearRoomSession(payload.code);
      }
      return settleEnter(scope, result, payload.playerName);
    },
    [request, settleEnter],
  );

  /** 방을 나간다 — 화면에서는 바로 나간 것으로 처리한다(서버 실패는 연결 끊김 유예로 정리된다) */
  const leaveRoom = useCallback(async () => {
    const current = roomRef.current;
    if (!current) return;
    clearRoomSession(current.code);
    roomRef.current = null;
    resetRoom();
    await request((s) => s.emitWithAck(TetrisBattleClientEvents.LEAVE_ROOM, { code: current.code }));
  }, [request, resetRoom]);

  const withRoom = useCallback(
    async <T,>(send: (code: string, s: TetrisBattleSocket) => Promise<TetrisBattleAck<T>>): Promise<BattleResult<T>> => {
      const current = roomRef.current;
      if (!current) return { ok: false, code: TetrisBattleErrorCodes.NOT_IN_ROOM };
      return request((s) => send(current.code, s));
    },
    [request],
  );

  const setReady = useCallback(
    (ready: boolean) => withRoom((code, s) => s.emitWithAck(TetrisBattleClientEvents.SET_READY, { code, ready })),
    [withRoom],
  );
  const startMatch = useCallback(
    () => withRoom((code, s) => s.emitWithAck(TetrisBattleClientEvents.START_MATCH, { code })),
    [withRoom],
  );
  const rematch = useCallback(
    () => withRoom((code, s) => s.emitWithAck(TetrisBattleClientEvents.REMATCH, { code })),
    [withRoom],
  );
  const registerMatchSync = useCallback((sync: MatchSync) => {
    matchSyncRef.current = sync;
    const pending = pendingRejoinRef.current;
    if (pending) {
      pendingRejoinRef.current = null;
      sync.onRejoin(pending);
    }
    return () => {
      if (matchSyncRef.current === sync) matchSyncRef.current = null;
    };
  }, []);

  const sendChat = useCallback(
    (text: string) => withRoom((code, s) => s.emitWithAck(TetrisBattleClientEvents.CHAT, { code, text })),
    [withRoom],
  );
  const sendEmote = useCallback(
    (emoteId: TetrisBattleEmoteId) => withRoom((code, s) => s.emitWithAck(TetrisBattleClientEvents.EMOTE, { code, emoteId })),
    [withRoom],
  );

  const value = useMemo<BattleSocketContextValue>(
    () => ({
      socket,
      status,
      rooms,
      room,
      myPlayerId,
      chat,
      emotes,
      roomNotice,
      reconnect,
      listRooms,
      createRoom,
      joinRoom,
      leaveRoom,
      setReady,
      startMatch,
      rematch,
      registerMatchSync,
      sendChat,
      sendEmote,
    }),
    [
      socket,
      status,
      rooms,
      room,
      myPlayerId,
      chat,
      emotes,
      roomNotice,
      reconnect,
      listRooms,
      createRoom,
      joinRoom,
      leaveRoom,
      setReady,
      startMatch,
      rematch,
      registerMatchSync,
      sendChat,
      sendEmote,
    ],
  );

  return <BattleSocketContext.Provider value={value}>{children}</BattleSocketContext.Provider>;
}

/**
 * 이 화면의 입장 범위 — joinRoom·createRoom에 넘기면, 화면을 떠난 뒤 온 성공 응답은 버리고 곧바로 나간다
 * 화면마다 따로라 다른 화면(막 들어온 방 화면 등)의 요청은 건드리지 않는다
 * 개발 모드 StrictMode는 마운트 직후 정리 → 재마운트를 하므로, 재마운트되면 cancelled를 되돌린다
 */
export function useEnterScope(): EnterScope {
  const scopeRef = useRef<EnterScope>({ cancelled: false });
  useEffect(() => {
    const scope = scopeRef.current;
    scope.cancelled = false;
    return () => {
      scope.cancelled = true;
    };
  }, []);
  return scopeRef.current;
}

export function useBattleSocket(): BattleSocketContextValue {
  const value = useContext(BattleSocketContext);
  if (!value) throw new Error('useBattleSocket은 BattleSocketProvider 안에서만 쓸 수 있습니다');
  return value;
}
