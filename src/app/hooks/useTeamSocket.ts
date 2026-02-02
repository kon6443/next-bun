'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import type { TeamSocket } from '@/types/socket';
import { TeamSocketEvents } from '@/types/socket';

const SOCKET_URL = process.env.NEXT_PUBLIC_API ?? '';

interface UseTeamSocketOptions {
  /** 자동 재연결 여부 (기본: true) */
  autoReconnect?: boolean;
  /** 재연결 시도 횟수 (기본: 5) */
  reconnectAttempts?: number;
  /** 재연결 딜레이 ms (기본: 1000) */
  reconnectDelay?: number;
}

interface UseTeamSocketReturn {
  /** Socket 인스턴스 */
  socket: TeamSocket | null;
  /** 연결 상태 */
  isConnected: boolean;
  /** 연결 에러 */
  error: string | null;
  /** 수동 연결 해제 */
  disconnect: () => void;
  /** 수동 재연결 */
  reconnect: () => void;
}

/**
 * Team WebSocket 연결 관리 훅
 *
 * @param teamId - 팀 ID
 * @param accessToken - JWT 인증 토큰
 * @param options - 옵션
 */
export function useTeamSocket(
  teamId: number,
  accessToken?: string,
  options: UseTeamSocketOptions = {},
): UseTeamSocketReturn {
  const { autoReconnect = true, reconnectAttempts = 5, reconnectDelay = 1000 } = options;

  // Socket을 상태로 관리하여 변경 시 re-render 트리거
  const [socket, setSocket] = useState<TeamSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // cleanup 시 참조용 ref
  const socketRef = useRef<TeamSocket | null>(null);
  const isConnectedRef = useRef(false);

  /**
   * Socket 연결 초기화
   */
  const initializeSocket = useCallback(() => {
    // 이미 연결되어 있으면 스킵
    if (socketRef.current?.connected) {
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

    // Socket.io 연결 생성
    const newSocket = io(`${SOCKET_URL}/teams`, {
      transports: ['websocket', 'polling'], // WebSocket 우선, polling 폴백
      auth: {
        token: accessToken, // JWT 토큰 전달
      },
      reconnection: autoReconnect,
      reconnectionAttempts: reconnectAttempts,
      reconnectionDelay: reconnectDelay,
      timeout: 10000,
    }) as TeamSocket;

    // 연결 성공
    newSocket.on('connect', () => {
      console.log('[Socket] 연결 성공:', newSocket.id);
      setIsConnected(true);
      isConnectedRef.current = true;
      setError(null);

      // 팀 room 참가
      newSocket.emit(TeamSocketEvents.JOIN_TEAM, { teamId }, response => {
        console.log('[Socket] 팀 참가 완료:', response);
      });
    });

    // 연결 해제
    newSocket.on('disconnect', reason => {
      console.log('[Socket] 연결 해제:', reason);
      setIsConnected(false);
      isConnectedRef.current = false;
    });

    // 연결 에러
    newSocket.on('connect_error', err => {
      console.error('[Socket] 연결 에러:', err.message);
      setError(`연결 실패: ${err.message}`);
      setIsConnected(false);
      isConnectedRef.current = false;
    });

    // 서버 에러 이벤트
    newSocket.on(TeamSocketEvents.ERROR, payload => {
      console.error('[Socket] 서버 에러:', payload);
      setError(payload.message);
    });

    // ref와 state 모두 업데이트
    socketRef.current = newSocket;
    setSocket(newSocket);
  }, [teamId, accessToken, autoReconnect, reconnectAttempts, reconnectDelay]);

  /**
   * 연결 해제
   */
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      // 팀 room 퇴장
      if (isConnectedRef.current && teamId) {
        socketRef.current.emit(TeamSocketEvents.LEAVE_TEAM, { teamId });
      }

      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
      isConnectedRef.current = false;
    }
  }, [teamId]);

  /**
   * 재연결
   */
  const reconnect = useCallback(() => {
    disconnect();
    // 다음 tick에서 재연결 (cleanup 완료 후)
    setTimeout(initializeSocket, 100);
  }, [disconnect, initializeSocket]);

  // 컴포넌트 마운트 시 연결, 언마운트 시 해제
  useEffect(() => {
    initializeSocket();

    return () => {
      disconnect();
    };
  }, [initializeSocket, disconnect]);

  return {
    socket,
    isConnected,
    error,
    disconnect,
    reconnect,
  };
}
