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
import { getTabId } from '../lib/tabId';

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

/** 방 나가기가 일시 실패했을 때 다시 보내는 간격 — 다 실패하면 소켓을 다시 붙여 서버가 끊김으로 정리하게 한다 */
export const LEAVE_RETRY_DELAYS_MS = [500, 1500] as const;
/** 다시 보내면 나아질 수 있는 나가기 실패 — 그 밖의 실패는 다시 보내지 않고 곧바로 소켓을 다시 붙인다 */
const LEAVE_RETRYABLE_CODES = new Set<string>([
  'TIMEOUT',
  TetrisBattleErrorCodes.ROOM_BUSY,
  TetrisBattleErrorCodes.SERVICE_UNAVAILABLE,
  TetrisBattleErrorCodes.RATE_LIMITED,
  TetrisBattleErrorCodes.INTERNAL_ERROR,
]);

/**
 * 입장이 SEAT_IN_USE면 이 간격으로 다시, 모두 이만큼까지 — 새로고침 직후 이전 연결이 서버에서 아직 안 끊긴 경우
 * (이전 탭이 사라졌으면 하트비트가 끊겨 최악 약 15초 안에 서버가 그 자리를 끊김으로 바꾼다 — D-010)
 */
export const SEAT_IN_USE_RETRY_MS = 3000;
export const SEAT_IN_USE_WAIT_MS = 20_000;

/** 서버가 끊었을 때 직접 다시 붙는 최소 간격 — 서버가 계속 끊으면 그다음부터는 수동 재연결로 */
export const SERVER_RECONNECT_MIN_GAP_MS = 5000;

/**
 * 나가기 결과 — left = 서버에서 나갔다(또는 방이 없다), other = 다른 탭이 자리를 가졌다(NOT_IN_ROOM),
 * dropped = 연결이 끊겼거나 끊어서 서버 유예 정리에 맡겼다, superseded = 그사이 다시 입장해 멈췄다(서버 자리는 새 입장의 것)
 */
type LeaveOutcome = 'left' | 'other' | 'dropped' | 'superseded';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const REPLACED_MESSAGE = '다른 탭이나 기기에서 이 방에 들어가 여기서는 나왔어요.';
const KICKED_MESSAGE = '방장이 방에서 내보냈어요.';

/** 입장 옵션 — retrySeatInUse = SEAT_IN_USE면 잠시 간격으로 다시(자동 입장), onSeatWait = 그렇게 기다리기 시작할 때 */
export type JoinOptions = { retrySeatInUse?: boolean; onSeatWait?: () => void };

export type BattleResult<T> = { ok: true; data: T } | { ok: false; code: BattleRequestErrorCode };

/** failed = 자동 재시도가 모두 끝남(수동 reconnect 필요) */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'failed';

export type ReceivedEmote = EmoteReceivedPayload & { key: number };

/** 입장 요청을 낸 화면의 범위 — 화면을 떠나면 cancelled가 되고, 그 뒤 도착한 성공 응답은 버리고 곧바로 나간다 */
export type EnterScope = { cancelled: boolean };

/**
 * 방에서 빠졌을 때의 안내 — 그 방 화면에서만 보인다
 * replaced = 다른 탭·기기가 자리를 넘겨받았다(자동으로 되찾지 않는다), kicked = 방장이 내보냈다(토큰도 무효)
 */
export type RoomNotice = { code: string; message: string; replaced?: boolean; kicked?: boolean };

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
  /** 그 방의 안내를 지운다 — 방 화면을 떠날 때 */
  clearRoomNotice: (code: string) => void;
  reconnect: () => void;
  listRooms: () => Promise<BattleResult<RoomSummary[]>>;
  createRoom: (payload: CreateRoomPayload, scope?: EnterScope) => Promise<BattleResult<EnterRoomAckData>>;
  /** 기다리는 동안(retrySeatInUse)도 입장 중으로 친다 */
  joinRoom: (payload: JoinRoomPayload, scope?: EnterScope, options?: JoinOptions) => Promise<BattleResult<EnterRoomAckData>>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<BattleResult<unknown>>;
  /** 방장 — 매치 시작 */
  startMatch: () => Promise<BattleResult<unknown>>;
  /** 방장 — 결과 화면에서 같은 방으로 재대결(대기실로) */
  rematch: () => Promise<BattleResult<unknown>>;
  /** 매치 화면이 재연결 복구를 받으려고 등록한다 — 해제 함수를 돌려준다 */
  registerMatchSync: (sync: MatchSync) => () => void;
  /** 이 탭이 그 방에 들어갈 때 받은 playerToken — 리플레이 제출용. 저장소 값은 다른 탭이 바꿀 수 있어 이 탭 메모리 값을 쓴다 */
  playerTokenFor: (code: string) => string | null;
  /**
   * 방 안 요청이 NOT_IN_ROOM을 받았다 — 서버가 이 소켓을 자리에서 뗐다(반쯤 열린 연결 판정 뒤 등). 토큰으로 한 번 복귀를 시도한다
   * 결과는 대전 화면의 onRejoin(성공)·방 밖으로(실패)로 알린다. 이미 복귀 중이면 아무것도 하지 않는다
   */
  recoverSeat: () => void;
  /** 방장 — 대기·결과 단계에서 다른 참가자를 내보낸다 */
  kickPlayer: (playerId: string) => Promise<BattleResult<unknown>>;
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
  /** 진행 중인 createRoom 수 — 나가기 재시도가 새 입장을 끊지 않게 */
  const inflightCreatesRef = useRef(0);
  /** 토큰 복귀 — 소켓 effect가 그 소켓으로 채운다(연결 때·NOT_IN_ROOM 복구 때 함께 쓴다) */
  const rejoinRef = useRef<(() => void) | null>(null);
  /** 복귀 요청이 응답을 기다리는 중 — NOT_IN_ROOM 복구를 겹쳐 보내지 않는다 */
  const rejoinPendingRef = useRef(false);
  /** 이 탭이 들어가 있는(들어갔던) 방의 토큰 */
  const heldRef = useRef<{ code: string; playerToken: string; playerName: string } | null>(null);
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
    // 렌더 전에 온 같은 방 roomState를 버리지 않게 바로 맞춘다
    roomRef.current = data.room;
    heldRef.current = { code: data.room.code, playerToken: data.playerToken, playerName };
    setRoom(data.room);
    setMyPlayerId(data.playerId);
    setRoomNotice(null);
    saveRoomSession(data.room.code, { playerId: data.playerId, playerToken: data.playerToken, playerName, tabId: getTabId() });
  }, []);

  /** 그 방에 들어가 있거나 들어가는 중이다 */
  const isInOrEntering = useCallback(
    (code: string) => roomRef.current?.code === code || inflightJoinsRef.current.has(code),
    [],
  );

  /** 들어가 있지 않고 들어가는 중도 아니다 — 나가기 재시도·재연결을 해도 새 자리를 건드리지 않는다 */
  const isIdle = useCallback(
    () => roomRef.current === null && inflightJoinsRef.current.size === 0 && inflightCreatesRef.current === 0,
    [],
  );

  // ===== 연결 =====

  // 언마운트 표시 — 언마운트 때 정리 함수는 선언 순서대로 돈다 — 소켓 연결 effect보다 먼저 두어 그 정리가 이 표시를 본다
  // StrictMode 재마운트면 다시 끈다. 개발 모드 Fast Refresh도 정리를 돌려 방 안이면 나간다(운영에는 없다)
  const unmountingRef = useRef(false);
  useEffect(() => {
    unmountingRef.current = false;
    return () => {
      unmountingRef.current = true;
    };
  }, []);

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

    /** 서버가 끊어 직접 다시 붙은 마지막 시각 */
    let lastServerReconnectAt = 0;

    /** 복귀 실패 — 화면을 방 밖으로 돌리고 이유를 남긴다. 토큰이 무효인 경우만 저장값을 지운다 */
    const dropRoom = (code: string, reason: BattleRequestErrorCode | null, playerToken?: string) => {
      if (playerToken && (reason === TetrisBattleErrorCodes.INVALID_PLAYER_TOKEN || reason === TetrisBattleErrorCodes.ROOM_NOT_FOUND)) {
        clearRoomSession(code, playerToken);
      }
      resetRoom();
      // 끊긴 사이 다른 탭·기기가 이 자리로 경기 중이다 — 자동으로 되찾지 않는다(넘겨받힘과 같게, 사용자가 고른다)
      if (reason === TetrisBattleErrorCodes.SEAT_IN_USE) {
        setRoomNotice({ code, message: battleErrorMessage(reason), replaced: true });
        return;
      }
      setRoomNotice({
        code,
        message:
          reason === TetrisBattleErrorCodes.ROOM_NOT_FOUND
            ? '방이 없어졌어요.'
            : `연결이 끊긴 사이 방에서 나왔어요. ${reason ? battleErrorMessage(reason) : '다시 입장해 주세요.'}`,
      });
    };

    /** 들어가 있던 방에 토큰으로 복귀한다 — 다시 붙었을 때, 방 안 요청이 NOT_IN_ROOM을 받았을 때 */
    const rejoin = () => {
      const current = roomRef.current;
      if (!current) return;
      const saved = loadRoomSession(current.code);
      // 이 탭이 받은 토큰을 먼저 — 저장값은 다른 탭이 바꿀 수 있다
      const held = heldRef.current?.code === current.code ? heldRef.current : null;
      // 끊긴 사이 같은 브라우저의 다른 탭이 같은 자리(같은 토큰)에 들어갔다(그 탭이 마지막으로 저장) — 조용히 되찾지 않는다
      // (넘겨받힘 알림은 끊긴 소켓이라 못 받았다). 다른 자리의 값이면 이 탭 자리로 복귀한다
      if (saved?.tabId && saved.tabId !== getTabId() && (!held || saved.playerToken === held.playerToken)) {
        roomRef.current = null;
        resetRoom();
        setRoomNotice({ code: current.code, message: REPLACED_MESSAGE, replaced: true });
        return;
      }
      // 둘 다 없으면 복귀할 수 없다
      const playerToken = held?.playerToken ?? saved?.playerToken;
      const playerName = held?.playerName ?? saved?.playerName;
      if (!playerToken || !playerName) {
        dropRoom(current.code, null);
        return;
      }
      const attempt = (retriesLeft: number) => {
        const lastGarbageId = matchSyncRef.current?.lastGarbageId() ?? null;
        s.timeout(SOCKET_CONFIG.ackTimeout).emit(
          TetrisBattleClientEvents.JOIN_ROOM,
          {
            code: current.code,
            playerName,
            playerToken,
            tabId: getTabId(),
            heartbeat: true,
            ...(lastGarbageId !== null ? { lastGarbageId } : {}),
          },
          (err: Error | null, response?: TetrisBattleAck<EnterRoomAckData>) => {
            onRejoinAck(retriesLeft, err, response);
          },
        );
      };
      const onRejoinAck = (retriesLeft: number, err: Error | null, response?: TetrisBattleAck<EnterRoomAckData>) => {
        const retrying = (err || !response) && retriesLeft > 0 && socketRef.current === s && s.connected;
        if (!retrying) rejoinPendingRef.current = false;
        if (roomRef.current?.code !== current.code) return; // 그사이 나갔다
        if (err || !response) {
          // 응답 없음 — 지금 이 소켓이 연결돼 있으면 같은 토큰으로 다시(다른 소켓이 생겼으면 그쪽 connect가 맡는다)
          if (retrying) attempt(retriesLeft - 1);
          else if (socketRef.current === s && s.connected) dropRoom(current.code, 'TIMEOUT');
        } else if (response.ok) {
          heldRef.current = { code: current.code, playerToken: response.data.playerToken, playerName };
          setRoom(response.data.room);
          setMyPlayerId(response.data.playerId);
          saveRoomSession(current.code, { playerId: response.data.playerId, playerToken: response.data.playerToken, playerName, tabId: getTabId() });
          matchSyncRef.current?.onRejoin(response.data.rejoin);
        } else {
          dropRoom(current.code, response.code, playerToken);
        }
      };
      rejoinPendingRef.current = true;
      attempt(REJOIN_RETRIES);
    };
    rejoinRef.current = rejoin;

    s.on('connect', () => {
      setStatus('connected');
      // 다시 붙었으면 들어가 있던 방에 복귀한다 (로비 목록 재구독은 로비 화면이 연결 상태를 보고 한다)
      rejoin();
    });
    // 서버가 끊었거나 연결을 거부하면 socket.io가 다시 시도하지 않는다(active=false) — 수동 재연결로
    s.on('disconnect', (reason) => {
      // 서버가 끊었다(하트비트 만료 등, D-010) — socket.io는 다시 붙지 않으므로 직접 붙는다. 붙으면 방 안이면 토큰으로 복귀한다
      // 서버가 곧바로 또 끊는 경우(인증 거부 등)에 되풀이하지 않게 간격을 둔다
      if (reason === 'io server disconnect' && Date.now() - lastServerReconnectAt >= SERVER_RECONNECT_MIN_GAP_MS) {
        lastServerReconnectAt = Date.now();
        setStatus('connecting');
        s.connect();
        return;
      }
      setStatus(s.active ? 'disconnected' : 'failed');
    });
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
    // 다른 탭·기기가 내 자리를 넘겨받았다 — 방 밖으로 돌리고 되찾기는 사용자가 고른다(저장값은 그쪽 것이라 그대로)
    s.on(TetrisBattleServerEvents.SESSION_REPLACED, (payload) => {
      if (roomRef.current?.code !== payload.code) return;
      roomRef.current = null;
      resetRoom();
      setRoomNotice({ code: payload.code, message: REPLACED_MESSAGE, replaced: true });
    });
    // 방장이 나를 내보냈다 — 토큰은 서버에서 이미 무효라 지우고, 방 화면은 로비로 돌린다
    s.on(TetrisBattleServerEvents.KICKED, (payload) => {
      if (roomRef.current?.code !== payload.code) return;
      const held = heldRef.current;
      if (held?.code === payload.code) clearRoomSession(payload.code, held.playerToken);
      roomRef.current = null;
      resetRoom();
      setRoomNotice({ code: payload.code, message: KICKED_MESSAGE, kicked: true });
    });
    // 접속 확인 — 방 안이면 곧바로 답한다. 서버가 보내는 때에 맞추므로 숨긴 탭의 타이머 제한을 받지 않는다 (D-012)
    s.on(TetrisBattleServerEvents.PRESENCE_PING, () => {
      const current = roomRef.current;
      if (current && s.connected) s.emit(TetrisBattleClientEvents.HEARTBEAT, { code: current.code });
    });

    return () => {
      s.removeAllListeners();
      s.io.off('reconnect_failed', onReconnectFailed);
      // 대전 화면을 떠나면(provider 언마운트) 방에서도 나간다 — 연결을 끊기 전에 응답 없이 한 번(최선 노력)
      // 로그인이 바뀌어 소켓만 바꾸는 경우에는 보내지 않는다(새 소켓이 토큰으로 복귀한다)
      // 저장값은 두다 — 나간 것이 확인되지 않았고(그사이 다른 탭이 넘겨받았으면 그 탭 값), 다음 입장에서 무효 토큰이면 지워진다
      const leaving = unmountingRef.current ? roomRef.current : null;
      if (leaving && s.connected) s.emit(TetrisBattleClientEvents.LEAVE_ROOM, { code: leaving.code }, () => {});
      s.disconnect();
      if (rejoinRef.current === rejoin) rejoinRef.current = null;
      rejoinPendingRef.current = false;
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

  /**
   * 서버에서 방을 나간다 — 화면은 이미 나갔다
   * 일시 실패(LEAVE_RETRYABLE_CODES)면 다시 보내고, 끝내 실패하면 소켓을 다시 붙여 서버가 끊김으로 정리하게 한다
   * (연결된 채 로비에 남으면 서버에 "연결된" 유령 자리가 남는다 — FE-25). 연결이 이미 끊겼으면 서버가 끊김으로 정리한다
   * 그사이 다른 방에 들어갔거나 들어가는 중이면 멈춘다 — 서버가 새 입장 때 이전 방을 정리하고, 다시 붙이면 새 자리가 끊긴다
   */
  const leaveOnServer = useCallback(
    async (code: string): Promise<LeaveOutcome> => {
      for (let attempt = 0; ; attempt++) {
        const result = await request((s) => s.emitWithAck(TetrisBattleClientEvents.LEAVE_ROOM, { code }));
        if (result.ok || result.code === TetrisBattleErrorCodes.ROOM_NOT_FOUND) return 'left';
        if (result.code === TetrisBattleErrorCodes.NOT_IN_ROOM) return 'other';
        if (result.code === 'DISCONNECTED') return 'dropped';
        if (!LEAVE_RETRYABLE_CODES.has(result.code) || attempt >= LEAVE_RETRY_DELAYS_MS.length) break;
        await sleep(LEAVE_RETRY_DELAYS_MS[attempt]);
        if (!isIdle()) return 'superseded';
      }
      const s = socketRef.current;
      if (!isIdle()) return 'superseded';
      if (!s?.connected) return 'dropped';
      s.disconnect();
      setStatus('connecting');
      s.connect();
      return 'dropped';
    },
    [request, isIdle],
  );

  /** 입장 응답 처리 — 요청한 화면을 이미 떠났으면 들어가지 않고 곧바로 나간다 */
  const settleEnter = useCallback(
    (scope: EnterScope | undefined, result: BattleResult<EnterRoomAckData>, playerName: string) => {
      if (!result.ok) return result;
      if (scope?.cancelled) {
        const code = result.data.room.code;
        // 그 방에 이미 다시 들어갔거나 같은 방 입장이 진행 중이면 leave를 보내지 않는다 — 늦은 leave가 새 자리를 지운다
        const superseded = roomRef.current?.code === code || (inflightJoinsRef.current.get(code) ?? 0) > 0;
        if (!superseded) {
          clearRoomSession(code, result.data.playerToken);
          void leaveOnServer(code);
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
    [enterRoom, leaveOnServer],
  );

  const createRoom = useCallback(
    async (payload: CreateRoomPayload, scope?: EnterScope) => {
      inflightCreatesRef.current++;
      try {
        const result = await request((s) =>
          s.emitWithAck(TetrisBattleClientEvents.CREATE_ROOM, { ...payload, tabId: getTabId(), heartbeat: true }),
        );
        return settleEnter(scope, result, payload.playerName);
      } finally {
        inflightCreatesRef.current--;
      }
    },
    [request, settleEnter],
  );

  const joinRoom = useCallback(
    async (payload: JoinRoomPayload, scope?: EnterScope, options?: JoinOptions) => {
      const inflight = inflightJoinsRef.current;
      inflight.set(payload.code, (inflight.get(payload.code) ?? 0) + 1);
      const send = () =>
        request((s) => s.emitWithAck(TetrisBattleClientEvents.JOIN_ROOM, { ...payload, tabId: getTabId(), heartbeat: true }));
      let result = await send();
      if (options?.retrySeatInUse) {
        let waited = 0;
        while (
          !result.ok &&
          result.code === TetrisBattleErrorCodes.SEAT_IN_USE &&
          waited + SEAT_IN_USE_RETRY_MS <= SEAT_IN_USE_WAIT_MS &&
          !scope?.cancelled
        ) {
          if (waited === 0) options.onSeatWait?.();
          await sleep(SEAT_IN_USE_RETRY_MS);
          waited += SEAT_IN_USE_RETRY_MS;
          if (!scope?.cancelled) result = await send();
        }
      }
      const left = (inflight.get(payload.code) ?? 1) - 1;
      if (left > 0) inflight.set(payload.code, left);
      else inflight.delete(payload.code);
      // 무효 토큰·없어진 방이면 저장값을 지운다(같은 토큰일 때만)
      if (
        !result.ok &&
        payload.playerToken &&
        (result.code === TetrisBattleErrorCodes.INVALID_PLAYER_TOKEN || result.code === TetrisBattleErrorCodes.ROOM_NOT_FOUND)
      ) {
        clearRoomSession(payload.code, payload.playerToken);
      }
      return settleEnter(scope, result, payload.playerName);
    },
    [request, settleEnter],
  );

  /**
   * 방을 나간다 — 화면에서는 바로 나간 것으로 처리한다
   * 저장값은 이 탭 토큰일 때 지운다 — NOT_IN_ROOM이면 그사이 다른 탭이 자리를 넘겨받아 그 탭이 쓰는 값이라 남긴다
   * (끊김 정리에 맡긴 경우도 지운다 — 직접 나갔으니 유예 안에 링크로 돌아와도 그 자리로 복귀하지 않게)
   */
  const leaveRoom = useCallback(async () => {
    const current = roomRef.current;
    if (!current) return;
    const held = heldRef.current?.code === current.code ? heldRef.current : null;
    roomRef.current = null;
    resetRoom();
    const outcome = await leaveOnServer(current.code);
    // 그사이 같은 방에 다시 들어갔거나 들어가는 중이면 그 입장의 토큰이다(재입장은 같은 토큰을 돌려준다) — 지우지 않는다
    if ((outcome === 'left' || outcome === 'dropped') && held && !isInOrEntering(current.code)) {
      clearRoomSession(current.code, held.playerToken);
    }
  }, [leaveOnServer, resetRoom, isInOrEntering]);

  const clearRoomNotice = useCallback((code: string) => {
    setRoomNotice((prev) => (prev?.code === code ? null : prev));
  }, []);

  const recoverSeat = useCallback(() => {
    if (!roomRef.current || rejoinPendingRef.current || !socketRef.current?.connected) return;
    rejoinRef.current?.();
  }, []);

  /** 방 안 요청 — 서버가 이 소켓을 자리에서 뗐으면(NOT_IN_ROOM) 토큰 복귀를 한 번 시도한다(원래 요청은 다시 보내지 않는다) */
  const withRoom = useCallback(
    async <T,>(send: (code: string, s: TetrisBattleSocket) => Promise<TetrisBattleAck<T>>): Promise<BattleResult<T>> => {
      const current = roomRef.current;
      if (!current) return { ok: false, code: TetrisBattleErrorCodes.NOT_IN_ROOM };
      const result = await request((s) => send(current.code, s));
      if (!result.ok && result.code === TetrisBattleErrorCodes.NOT_IN_ROOM && roomRef.current?.code === current.code) recoverSeat();
      return result;
    },
    [request, recoverSeat],
  );

  const kickPlayer = useCallback(
    (playerId: string) => withRoom((code, s) => s.emitWithAck(TetrisBattleClientEvents.KICK_PLAYER, { code, playerId })),
    [withRoom],
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

  const playerTokenFor = useCallback((code: string) => (heldRef.current?.code === code ? heldRef.current.playerToken : null), []);

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
      clearRoomNotice,
      reconnect,
      listRooms,
      createRoom,
      joinRoom,
      leaveRoom,
      setReady,
      startMatch,
      rematch,
      registerMatchSync,
      playerTokenFor,
      recoverSeat,
      kickPlayer,
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
      clearRoomNotice,
      reconnect,
      listRooms,
      createRoom,
      joinRoom,
      leaveRoom,
      setReady,
      startMatch,
      rematch,
      registerMatchSync,
      playerTokenFor,
      recoverSeat,
      kickPlayer,
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
