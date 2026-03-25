'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useSession } from 'next-auth/react';
import { io } from 'socket.io-client';
import type {
  FishingSocket,
  FishingOnlineUserInfo,
} from '@/types/fishingSocket';
import { FishingSocketEvents } from '@/types/fishingSocket';

const SOCKET_URL = process.env.NEXT_PUBLIC_API ?? '';

// ===== Context 타입 정의 =====

interface FishingSocketContextValue {
  socket: FishingSocket | null;
  isConnected: boolean;
  error: string | null;
  mapId: string;
  onlineUsers: FishingOnlineUserInfo[];
  onlineCount: number;
  /** 다른 유저 위치 (userId → position + meta) */
  otherPlayers: Map<number, OtherPlayer>;
  /** 위치 emit (throttle 적용됨) */
  emitMove: (x: number, y: number, direction: 'left' | 'right') => void;
  /** 낚시 상태 emit */
  emitFishingState: (state: string, pointId?: string) => void;
  /** 채팅 메시지 emit */
  emitChatMessage: (message: string) => void;
  /** 낚시 결과 emit */
  emitCatchResult: (fishName: string, grade: string, size: number, weight: number) => void;
  reconnect: () => void;
}

export interface OtherPlayer {
  userId: number;
  userName: string;
  /** 현재 보간된 위치 */
  x: number;
  y: number;
  direction: 'left' | 'right';
  /** 서버에서 받은 목표 위치 (보간용) */
  targetX: number;
  targetY: number;
  targetDirection: 'left' | 'right';
  /** 마지막 업데이트 시간 */
  lastUpdate: number;
  fishingState?: string;
  pointId?: string;
}

// ===== Context 생성 =====

const FishingSocketContext = createContext<FishingSocketContextValue | null>(null);

// ===== 설정 상수 =====

const SOCKET_CONFIG = {
  autoReconnect: true,
  reconnectAttempts: 5,
  reconnectDelay: 1000,
  timeout: 10000,
  connectDebounce: 300,
  /** 위치 emit throttle (ms) — 50ms = 초당 20회, 부하 무시 수준 */
  moveThrottle: 50,
} as const;

// ===== Provider Props =====

interface FishingSocketProviderProps {
  children: ReactNode;
  mapId: string;
}

// ===== Provider 컴포넌트 =====

export function FishingSocketProvider({ children, mapId }: FishingSocketProviderProps) {
  const { data: session, status: sessionStatus } = useSession();

  // State
  const [socket, setSocket] = useState<FishingSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<FishingOnlineUserInfo[]>([]);
  const [otherPlayers, setOtherPlayers] = useState<Map<number, OtherPlayer>>(new Map());

  // Refs
  const socketRef = useRef<FishingSocket | null>(null);
  const isConnectingRef = useRef(false);
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentMapIdRef = useRef(mapId);
  const lastMoveTimeRef = useRef(0);
  const currentUserIdRef = useRef<number | undefined>(session?.user?.userId);
  currentUserIdRef.current = session?.user?.userId;

  useEffect(() => {
    currentMapIdRef.current = mapId;
  }, [mapId]);

  /**
   * 실제 소켓 연결 생성 (디바운스 후 호출됨)
   * @param accessToken - 로그인 유저의 토큰 (게스트면 undefined)
   */
  const createSocket = useCallback((accessToken?: string) => {
    if (socketRef.current?.connected) {
      isConnectingRef.current = false;
      return;
    }

    const authConfig = accessToken ? { token: accessToken } : {};

    const newSocket = io(`${SOCKET_URL}/fishing`, {
      transports: ['websocket', 'polling'],
      auth: authConfig,
      reconnection: SOCKET_CONFIG.autoReconnect,
      reconnectionAttempts: SOCKET_CONFIG.reconnectAttempts,
      reconnectionDelay: SOCKET_CONFIG.reconnectDelay,
      timeout: SOCKET_CONFIG.timeout,
      closeOnBeforeunload: true,
    }) as FishingSocket;

    // 연결 성공
    newSocket.on('connect', () => {
      isConnectingRef.current = false;
      setIsConnected(true);
      setError(null);

      // 맵 room 참가
      newSocket.emit(
        FishingSocketEvents.JOIN_MAP,
        { mapId: currentMapIdRef.current },
        () => {
          // 접속 즉시 초기 위치 emit (다른 유저에게 보이도록)
          newSocket.emit(FishingSocketEvents.MOVE, {
            x: 400,
            y: 420,
            direction: 'right' as const,
          });
        },
      );
    });

    // 연결 해제
    newSocket.on('disconnect', () => {
      isConnectingRef.current = false;
      setIsConnected(false);
    });

    // 연결 에러
    newSocket.on('connect_error', (err) => {
      console.error('[FishingSocket] 연결 에러:', err.message);
      isConnectingRef.current = false;
      setError(`연결 실패: ${err.message}`);
      setIsConnected(false);
    });

    // 서버 에러
    newSocket.on(FishingSocketEvents.ERROR, (payload) => {
      console.warn('[FishingSocket] 서버 에러:', payload);
      if (payload.message) setError(payload.message);
    });

    // 온라인 유저 목록 (접속 시 서버에서 전송)
    newSocket.on(FishingSocketEvents.ONLINE_USERS, (payload) => {
      setOnlineUsers(payload.users);
    });

    // 유저 접속
    newSocket.on(FishingSocketEvents.USER_JOINED, (payload) => {
      setOnlineUsers((prev) => {
        const idx = prev.findIndex((u) => u.userId === payload.userId);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], connectionCount: payload.connectionCount };
          return updated;
        }
        return [
          ...prev,
          {
            userId: payload.userId,
            userName: payload.userName,
            connectionCount: payload.connectionCount,
            position: payload.position,
          },
        ];
      });
    });

    // 유저 퇴장
    newSocket.on(FishingSocketEvents.USER_LEFT, (payload) => {
      if (payload.connectionCount === 0) {
        setOnlineUsers((prev) => prev.filter((u) => u.userId !== payload.userId));
        setOtherPlayers((prev) => {
          const next = new Map(prev);
          next.delete(payload.userId);
          return next;
        });
      } else {
        setOnlineUsers((prev) =>
          prev.map((u) =>
            u.userId === payload.userId ? { ...u, connectionCount: payload.connectionCount } : u,
          ),
        );
      }
    });

    // 초기 플레이어 위치 목록 (본인 제외)
    newSocket.on(FishingSocketEvents.PLAYER_POSITIONS, (payload) => {
      const now = Date.now();
      const myId = currentUserIdRef.current;
      setOtherPlayers((prev) => {
        const next = new Map(prev);
        for (const [uid, data] of Object.entries(payload.positions)) {
          const userId = Number(uid);
          if (userId === myId) continue; // 본인 제외
          next.set(userId, {
            userId,
            userName: data.userName,
            x: data.x,
            y: data.y,
            direction: data.direction,
            targetX: data.x,
            targetY: data.y,
            targetDirection: data.direction,
            lastUpdate: now,
            fishingState: data.fishingState,
          });
        }
        return next;
      });
    });

    // 다른 유저 위치 업데이트 (MOVE는 서버에서 본인 제외 broadcast이므로 필터 불필요)
    newSocket.on(FishingSocketEvents.PLAYER_MOVED, (payload) => {
      setOtherPlayers((prev) => {
        const next = new Map(prev);
        const existing = next.get(payload.userId);
        next.set(payload.userId, {
          userId: payload.userId,
          userName: payload.userName,
          x: existing?.x ?? payload.x,
          y: existing?.y ?? payload.y,
          direction: existing?.direction ?? payload.direction,
          targetX: payload.x,
          targetY: payload.y,
          targetDirection: payload.direction,
          lastUpdate: payload.timestamp,
          fishingState: existing?.fishingState,
          pointId: existing?.pointId,
        });
        return next;
      });
    });

    // 다른 유저 낚시 상태 변경
    newSocket.on(FishingSocketEvents.PLAYER_FISHING_STATE, (payload) => {
      setOtherPlayers((prev) => {
        const next = new Map(prev);
        const existing = next.get(payload.userId);
        if (existing) {
          next.set(payload.userId, {
            ...existing,
            fishingState: payload.state,
            pointId: payload.pointId,
          });
        }
        return next;
      });
    });

    socketRef.current = newSocket;
    setSocket(newSocket);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mapId triggers reconnection via dependency chain
  }, [mapId]);

  /**
   * Socket 연결 초기화 (디바운스 적용)
   * 로그인 유저: JWT 토큰으로 인증 연결
   * 비로그인 유저: 토큰 없이 게스트 연결
   */
  const initializeSocket = useCallback(() => {
    const accessToken = session?.user?.accessToken;

    if (socketRef.current?.connected || isConnectingRef.current) return;
    if (sessionStatus === 'loading') return;

    setError(null);
    isConnectingRef.current = true;

    if (connectTimerRef.current) {
      clearTimeout(connectTimerRef.current);
    }

    connectTimerRef.current = setTimeout(() => {
      connectTimerRef.current = null;
      createSocket(accessToken);
    }, SOCKET_CONFIG.connectDebounce);
  }, [session?.user?.accessToken, sessionStatus, createSocket]);

  /**
   * Socket 연결 해제
   */
  const disconnectSocket = useCallback(() => {
    if (connectTimerRef.current) {
      clearTimeout(connectTimerRef.current);
      connectTimerRef.current = null;
    }
    isConnectingRef.current = false;
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
      setOnlineUsers([]);
      setOtherPlayers(new Map());
    }
  }, []);

  const reconnect = useCallback(() => {
    disconnectSocket();
    setTimeout(initializeSocket, 100);
  }, [disconnectSocket, initializeSocket]);

  // 마운트 시 연결, 언마운트 시 해제
  useEffect(() => {
    initializeSocket();
    return () => {
      disconnectSocket();
    };
  }, [initializeSocket, disconnectSocket]);

  // ===== Emit 함수들 =====

  const emitMove = useCallback((x: number, y: number, direction: 'left' | 'right') => {
    const now = Date.now();
    if (now - lastMoveTimeRef.current < SOCKET_CONFIG.moveThrottle) return;
    lastMoveTimeRef.current = now;

    socketRef.current?.emit(FishingSocketEvents.MOVE, { x, y, direction });
  }, []);

  const emitFishingState = useCallback((state: string, pointId?: string) => {
    socketRef.current?.emit(FishingSocketEvents.FISHING_STATE, {
      state: state as FishingStatePayload['state'],
      pointId,
    });
  }, []);

  const emitChatMessage = useCallback((message: string) => {
    socketRef.current?.emit(FishingSocketEvents.CHAT_MESSAGE, { message });
  }, []);

  const emitCatchResult = useCallback(
    (fishName: string, grade: string, size: number, weight: number) => {
      socketRef.current?.emit(FishingSocketEvents.CATCH_RESULT, {
        fishName,
        grade,
        size,
        weight,
      });
    },
    [],
  );

  const onlineCount = useMemo(() => onlineUsers.length, [onlineUsers]);

  const contextValue = useMemo<FishingSocketContextValue>(
    () => ({
      socket,
      isConnected,
      error,
      mapId,
      onlineUsers,
      onlineCount,
      otherPlayers,
      emitMove,
      emitFishingState,
      emitChatMessage,
      emitCatchResult,
      reconnect,
    }),
    [
      socket,
      isConnected,
      error,
      mapId,
      onlineUsers,
      onlineCount,
      otherPlayers,
      emitMove,
      emitFishingState,
      emitChatMessage,
      emitCatchResult,
      reconnect,
    ],
  );

  return (
    <FishingSocketContext.Provider value={contextValue}>
      {children}
    </FishingSocketContext.Provider>
  );
}

// ===== Hooks =====

export function useFishingSocketContext(): FishingSocketContextValue {
  const context = useContext(FishingSocketContext);
  if (!context) {
    throw new Error(
      'useFishingSocketContext must be used within a FishingSocketProvider.',
    );
  }
  return context;
}

/**
 * Optional 버전 — Provider 밖에서도 사용 가능 (null 반환).
 * 비로그인 유저의 싱글플레이어 모드에서 사용.
 */
export function useFishingSocketContextOptional(): FishingSocketContextValue | null {
  return useContext(FishingSocketContext);
}

// FishingStatePayload 타입을 emit 함수에서 사용하기 위해 import
import type { FishingStatePayload } from '@/types/fishingSocket';
