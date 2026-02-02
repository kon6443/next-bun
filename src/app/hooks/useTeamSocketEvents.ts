'use client';

import { useEffect, useRef, useCallback } from 'react';
import type {
  TeamSocket,
  TaskCreatedPayload,
  TaskUpdatedPayload,
  TaskStatusChangedPayload,
  TaskActiveStatusChangedPayload,
  TaskDeletedPayload,
  CommentCreatedPayload,
  CommentUpdatedPayload,
  CommentDeletedPayload,
} from '@/types/socket';
import { TeamSocketEvents } from '@/types/socket';

interface TeamSocketEventHandlers {
  /** 태스크 생성 이벤트 핸들러 */
  onTaskCreated?: (payload: TaskCreatedPayload) => void;
  /** 태스크 수정 이벤트 핸들러 */
  onTaskUpdated?: (payload: TaskUpdatedPayload) => void;
  /** 태스크 상태 변경 이벤트 핸들러 */
  onTaskStatusChanged?: (payload: TaskStatusChangedPayload) => void;
  /** 태스크 활성 상태 변경 이벤트 핸들러 */
  onTaskActiveStatusChanged?: (payload: TaskActiveStatusChangedPayload) => void;
  /** 태스크 삭제 이벤트 핸들러 */
  onTaskDeleted?: (payload: TaskDeletedPayload) => void;
  /** 댓글 생성 이벤트 핸들러 */
  onCommentCreated?: (payload: CommentCreatedPayload) => void;
  /** 댓글 수정 이벤트 핸들러 */
  onCommentUpdated?: (payload: CommentUpdatedPayload) => void;
  /** 댓글 삭제 이벤트 핸들러 */
  onCommentDeleted?: (payload: CommentDeletedPayload) => void;
}

/**
 * Team Socket 이벤트 리스너 훅
 *
 * Socket 이벤트를 구독하고 핸들러를 호출합니다.
 * 컴포넌트 언마운트 시 자동으로 리스너를 정리합니다.
 *
 * @param socket - TeamSocket 인스턴스 (null이면 리스너 등록 안함)
 * @param handlers - 이벤트 핸들러 객체
 * @param currentUserId - 현재 사용자 ID (본인 이벤트 필터링용, optional)
 */
export function useTeamSocketEvents(
  socket: TeamSocket | null,
  handlers: TeamSocketEventHandlers,
  currentUserId?: number,
): void {
  // 핸들러를 ref로 저장하여 useEffect 의존성에서 제외
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // 현재 사용자 ID ref
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  /**
   * 본인 이벤트 여부 체크
   * 본인이 트리거한 이벤트는 무시 (HTTP 응답으로 이미 처리됨)
   */
  const isSelfTriggered = useCallback((triggeredBy: number): boolean => {
    return currentUserIdRef.current !== undefined && triggeredBy === currentUserIdRef.current;
  }, []);

  useEffect(() => {
    if (!socket) return;

    // 태스크 생성 이벤트
    const handleTaskCreated = (payload: TaskCreatedPayload) => {
      // 본인이 생성한 태스크는 HTTP 응답으로 처리되므로 스킵
      if (isSelfTriggered(payload.createdBy)) {
        console.log('[Socket] 본인 태스크 생성 이벤트 스킵:', payload.taskId);
        return;
      }
      console.log('[Socket] 태스크 생성:', payload);
      handlersRef.current.onTaskCreated?.(payload);
    };

    // 태스크 수정 이벤트
    const handleTaskUpdated = (payload: TaskUpdatedPayload) => {
      if (isSelfTriggered(payload.updatedBy)) {
        console.log('[Socket] 본인 태스크 수정 이벤트 스킵:', payload.taskId);
        return;
      }
      console.log('[Socket] 태스크 수정:', payload);
      handlersRef.current.onTaskUpdated?.(payload);
    };

    // 태스크 상태 변경 이벤트
    const handleTaskStatusChanged = (payload: TaskStatusChangedPayload) => {
      if (isSelfTriggered(payload.updatedBy)) {
        console.log('[Socket] 본인 상태 변경 이벤트 스킵:', payload.taskId);
        return;
      }
      console.log('[Socket] 태스크 상태 변경:', payload);
      handlersRef.current.onTaskStatusChanged?.(payload);
    };

    // 태스크 활성 상태 변경 이벤트
    const handleTaskActiveStatusChanged = (payload: TaskActiveStatusChangedPayload) => {
      if (isSelfTriggered(payload.updatedBy)) {
        console.log('[Socket] 본인 활성 상태 변경 이벤트 스킵:', payload.taskId);
        return;
      }
      console.log('[Socket] 태스크 활성 상태 변경:', payload);
      handlersRef.current.onTaskActiveStatusChanged?.(payload);
    };

    // 태스크 삭제 이벤트
    const handleTaskDeleted = (payload: TaskDeletedPayload) => {
      if (isSelfTriggered(payload.deletedBy)) {
        console.log('[Socket] 본인 태스크 삭제 이벤트 스킵:', payload.taskId);
        return;
      }
      console.log('[Socket] 태스크 삭제:', payload);
      handlersRef.current.onTaskDeleted?.(payload);
    };

    // 댓글 생성 이벤트
    const handleCommentCreated = (payload: CommentCreatedPayload) => {
      if (isSelfTriggered(payload.userId)) {
        console.log('[Socket] 본인 댓글 생성 이벤트 스킵:', payload.commentId);
        return;
      }
      console.log('[Socket] 댓글 생성:', payload);
      handlersRef.current.onCommentCreated?.(payload);
    };

    // 댓글 수정 이벤트
    const handleCommentUpdated = (payload: CommentUpdatedPayload) => {
      if (isSelfTriggered(payload.updatedBy)) {
        console.log('[Socket] 본인 댓글 수정 이벤트 스킵:', payload.commentId);
        return;
      }
      console.log('[Socket] 댓글 수정:', payload);
      handlersRef.current.onCommentUpdated?.(payload);
    };

    // 댓글 삭제 이벤트
    const handleCommentDeleted = (payload: CommentDeletedPayload) => {
      if (isSelfTriggered(payload.deletedBy)) {
        console.log('[Socket] 본인 댓글 삭제 이벤트 스킵:', payload.commentId);
        return;
      }
      console.log('[Socket] 댓글 삭제:', payload);
      handlersRef.current.onCommentDeleted?.(payload);
    };

    // 이벤트 리스너 등록
    socket.on(TeamSocketEvents.TASK_CREATED, handleTaskCreated);
    socket.on(TeamSocketEvents.TASK_UPDATED, handleTaskUpdated);
    socket.on(TeamSocketEvents.TASK_STATUS_CHANGED, handleTaskStatusChanged);
    socket.on(TeamSocketEvents.TASK_ACTIVE_STATUS_CHANGED, handleTaskActiveStatusChanged);
    socket.on(TeamSocketEvents.TASK_DELETED, handleTaskDeleted);
    socket.on(TeamSocketEvents.COMMENT_CREATED, handleCommentCreated);
    socket.on(TeamSocketEvents.COMMENT_UPDATED, handleCommentUpdated);
    socket.on(TeamSocketEvents.COMMENT_DELETED, handleCommentDeleted);

    // Cleanup: 이벤트 리스너 해제
    return () => {
      socket.off(TeamSocketEvents.TASK_CREATED, handleTaskCreated);
      socket.off(TeamSocketEvents.TASK_UPDATED, handleTaskUpdated);
      socket.off(TeamSocketEvents.TASK_STATUS_CHANGED, handleTaskStatusChanged);
      socket.off(TeamSocketEvents.TASK_ACTIVE_STATUS_CHANGED, handleTaskActiveStatusChanged);
      socket.off(TeamSocketEvents.TASK_DELETED, handleTaskDeleted);
      socket.off(TeamSocketEvents.COMMENT_CREATED, handleCommentCreated);
      socket.off(TeamSocketEvents.COMMENT_UPDATED, handleCommentUpdated);
      socket.off(TeamSocketEvents.COMMENT_DELETED, handleCommentDeleted);
    };
  }, [socket, isSelfTriggered]);
}
