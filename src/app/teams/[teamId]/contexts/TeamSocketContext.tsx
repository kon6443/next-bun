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
import type { TeamSocket, OnlineUserInfo } from '@/types/socket';
import { TeamSocketEvents } from '@/types/socket';

const SOCKET_URL = process.env.NEXT_PUBLIC_API ?? '';

// ===== Context 타입 정의 =====

interface TeamSocketContextValue {
  /** Socket 인스턴스 (연결 전이면 null) */
  socket: TeamSocket | null;
  /** 연결 상태 */
  isConnected: boolean;
  /** 연결 에러 메시지 */
  error: string | null;
  /** 현재 팀 ID */
  teamId: number;
  /** 온라인 유저 목록 */
  onlineUsers: OnlineUserInfo[];
  /** 온라인 유저 목록 업데이트 함수 */
  setOnlineUsers: React.Dispatch<React.SetStateAction<OnlineUserInfo[]>>;
  /** 수동 재연결 */
  reconnect: () => void;
}

// ===== Context 생성 =====

const TeamSocketContext = createContext<TeamSocketContextValue | null>(null);

// ===== Provider Props =====

interface TeamSocketProviderProps {
  children: ReactNode;
  teamId: number;
}

// ===== Socket 설정 상수 =====

const SOCKET_CONFIG = {
  /** 자동 재연결 여부 */
  autoReconnect: true,
  /** 재연결 시도 횟수 */
  reconnectAttempts: 5,
  /** 재연결 딜레이 (ms) */
  reconnectDelay: 1000,
  /** 연결 타임아웃 (ms) */
  timeout: 10000,
  /** 연결 디바운스 딜레이 (ms) - 빠른 새로고침 시 고스트 소켓 방지 */
  connectDebounce: 300,
} as const;

// ===== Provider 컴포넌트 =====

/**
 * Team Socket Provider
 *
 * teams/[teamId] 하위의 모든 페이지에서 동일한 소켓 연결을 공유합니다.
 * layout.tsx에서 사용되어 페이지 이동 시에도 연결이 유지됩니다.
 */
export function TeamSocketProvider({ children, teamId }: TeamSocketProviderProps) {
  const { data: session, status: sessionStatus } = useSession();

  // State
  const [socket, setSocket] = useState<TeamSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUserInfo[]>([]);

  // Refs (cleanup 및 최신 상태 참조용)
  const socketRef = useRef<TeamSocket | null>(null);
  const isConnectedRef = useRef(false);
  const isConnectingRef = useRef(false);
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTeamIdRef = useRef(teamId);

  // teamId 변경 추적
  useEffect(() => {
    currentTeamIdRef.current = teamId;
  }, [teamId]);

  /**
   * 실제 소켓 연결 생성 (디바운스 후 호출됨)
   */
  const createSocket = useCallback((accessToken: string) => {
    // 디바운스 대기 중 상태가 변했을 수 있으므로 다시 체크
    if (socketRef.current?.connected) {
      isConnectingRef.current = false;
      return;
    }

    // Socket.io 연결 생성
    const newSocket = io(`${SOCKET_URL}/teams`, {
      transports: ['websocket', 'polling'],
      auth: {
        token: accessToken,
      },
      reconnection: SOCKET_CONFIG.autoReconnect,
      reconnectionAttempts: SOCKET_CONFIG.reconnectAttempts,
      reconnectionDelay: SOCKET_CONFIG.reconnectDelay,
      timeout: SOCKET_CONFIG.timeout,
      // 새로고침/탭 닫기 시 underlying transport를 즉시 닫음 (고스트 소켓 방지)
      closeOnBeforeunload: true,
    }) as TeamSocket;

    // 연결 성공
    newSocket.on('connect', () => {
      console.log('[TeamSocket] 연결 성공:', newSocket.id);
      isConnectingRef.current = false;
      setIsConnected(true);
      isConnectedRef.current = true;
      setError(null);

      // 팀 room 참가
      newSocket.emit(
        TeamSocketEvents.JOIN_TEAM,
        { teamId: currentTeamIdRef.current },
        (response) => {
          console.log('[TeamSocket] 팀 참가 완료:', response);
        }
      );
    });

    // 연결 해제
    newSocket.on('disconnect', (reason) => {
      console.log('[TeamSocket] 연결 해제:', reason);
      isConnectingRef.current = false;
      setIsConnected(false);
      isConnectedRef.current = false;
    });

    // 연결 에러
    newSocket.on('connect_error', (err) => {
      console.error('[TeamSocket] 연결 에러:', err.message);
      isConnectingRef.current = false;
      setError(`연결 실패: ${err.message}`);
      setIsConnected(false);
      isConnectedRef.current = false;
    });

    // 서버 에러 이벤트
    newSocket.on(TeamSocketEvents.ERROR, (payload) => {
      console.error('[TeamSocket] 서버 에러:', payload);
      setError(payload.message);
    });

    // 온라인 유저 목록 이벤트 (첫 접속 시 서버에서 전송)
    newSocket.on(TeamSocketEvents.ONLINE_USERS, (payload) => {
      console.log('[TeamSocket] 온라인 유저 목록:', payload);
      setOnlineUsers(payload.users);
    });

    // 유저 접속 이벤트
    newSocket.on(TeamSocketEvents.USER_JOINED, (payload) => {
      console.log('[TeamSocket] 유저 접속:', payload);
      setOnlineUsers((prev) => {
        const existingIndex = prev.findIndex((u) => u.userId === payload.userId);
        if (existingIndex >= 0) {
          // 기존 유저 업데이트 (다중 탭 접속)
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            connectionCount: payload.connectionCount,
          };
          return updated;
        } else {
          // 새 유저 추가
          return [
            ...prev,
            {
              userId: payload.userId,
              userName: payload.userName,
              connectionCount: payload.connectionCount,
            },
          ];
        }
      });
    });

    // 유저 퇴장 이벤트
    newSocket.on(TeamSocketEvents.USER_LEFT, (payload) => {
      console.log('[TeamSocket] 유저 퇴장:', payload);
      setOnlineUsers((prev) => {
        if (payload.connectionCount === 0) {
          // 완전히 오프라인 → 목록에서 제거
          return prev.filter((u) => u.userId !== payload.userId);
        } else {
          // 다중 탭 중 일부만 종료 → 카운트만 업데이트
          return prev.map((u) =>
            u.userId === payload.userId
              ? { ...u, connectionCount: payload.connectionCount }
              : u
          );
        }
      });
    });

    // ref와 state 모두 업데이트
    socketRef.current = newSocket;
    setSocket(newSocket);
  }, [teamId]);

  /**
   * Socket 연결 초기화 (디바운스 적용)
   *
   * 빠른 새로고침 시 이전 타이머가 취소되어 소켓이 생성되지 않음.
   * 페이지가 안정화된 후에만 실제 연결이 수행됨.
   */
  const initializeSocket = useCallback(() => {
    const accessToken = session?.user?.accessToken;

    // 이미 연결되어 있거나 연결 진행 중이면 스킵
    if (socketRef.current?.connected || isConnectingRef.current) {
      return;
    }

    // 세션 로딩 중이면 대기
    if (sessionStatus === 'loading') {
      return;
    }

    // 토큰 없으면 연결하지 않음
    if (!accessToken) {
      setError('인증 토큰이 필요합니다.');
      return;
    }

    // 유효하지 않은 teamId면 연결하지 않음
    if (!teamId || isNaN(teamId) || teamId <= 0) {
      setError('유효하지 않은 팀 ID입니다.');
      return;
    }

    setError(null);
    isConnectingRef.current = true;

    // 이전 대기 중인 연결 타이머 취소
    if (connectTimerRef.current) {
      clearTimeout(connectTimerRef.current);
    }

    // 디바운스: 페이지가 안정화된 후에만 실제 소켓 생성
    connectTimerRef.current = setTimeout(() => {
      connectTimerRef.current = null;
      createSocket(accessToken);
    }, SOCKET_CONFIG.connectDebounce);
  }, [teamId, session?.user?.accessToken, sessionStatus, createSocket]);

  /**
   * Socket 연결 해제
   *
   * 주의: LEAVE_TEAM 이벤트를 별도로 emit하지 않음
   * - disconnect()가 호출되면 서버의 handleDisconnect에서 모든 정리 작업 수행
   * - LEAVE_TEAM emit + disconnect()를 동시에 하면 중복 알림 발생
   */
  const disconnectSocket = useCallback(() => {
    // 대기 중인 연결 타이머 취소
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
      isConnectedRef.current = false;
      setOnlineUsers([]);
    }
  }, []);

  /**
   * 수동 재연결
   */
  const reconnect = useCallback(() => {
    disconnectSocket();
    // 다음 tick에서 재연결 (cleanup 완료 후)
    setTimeout(initializeSocket, 100);
  }, [disconnectSocket, initializeSocket]);

  // 마운트 시 연결, 언마운트 시 해제
  useEffect(() => {
    initializeSocket();

    return () => {
      disconnectSocket();
    };
  }, [initializeSocket, disconnectSocket]);

  // Context value 메모이제이션
  const contextValue = useMemo<TeamSocketContextValue>(
    () => ({
      socket,
      isConnected,
      error,
      teamId,
      onlineUsers,
      setOnlineUsers,
      reconnect,
    }),
    [socket, isConnected, error, teamId, onlineUsers, reconnect]
  );

  return (
    <TeamSocketContext.Provider value={contextValue}>
      {children}
    </TeamSocketContext.Provider>
  );
}

// ===== Custom Hook =====

/**
 * Team Socket Context 사용 훅
 *
 * TeamSocketProvider 내부에서만 사용 가능합니다.
 * Provider 외부에서 호출하면 에러를 throw합니다.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { socket, isConnected, onlineUsers } = useTeamSocketContext();
 *   // ...
 * }
 * ```
 */
export function useTeamSocketContext(): TeamSocketContextValue {
  const context = useContext(TeamSocketContext);

  if (!context) {
    throw new Error(
      'useTeamSocketContext must be used within a TeamSocketProvider. ' +
        'Make sure your component is wrapped with TeamSocketProvider in the layout.'
    );
  }

  return context;
}

// ===== 하위 호환성을 위한 Optional Hook =====

/**
 * Team Socket Context 사용 훅 (Optional 버전)
 *
 * Provider 외부에서도 사용 가능하며, 그 경우 null을 반환합니다.
 * Provider 내부인지 확인이 필요한 경우에 사용합니다.
 */
export function useTeamSocketContextOptional(): TeamSocketContextValue | null {
  return useContext(TeamSocketContext);
}
