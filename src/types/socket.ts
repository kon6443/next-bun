import type { Socket } from 'socket.io-client';

// ===== 이벤트 상수 (백엔드와 동기화) =====

export const TeamSocketEvents = {
  // Client → Server
  JOIN_TEAM: 'joinTeam',
  LEAVE_TEAM: 'leaveTeam',

  // Server → Client (태스크)
  TASK_CREATED: 'taskCreated',
  TASK_UPDATED: 'taskUpdated',
  TASK_STATUS_CHANGED: 'taskStatusChanged',
  TASK_ACTIVE_STATUS_CHANGED: 'taskActiveStatusChanged',
  TASK_DELETED: 'taskDeleted',

  // Server → Client (댓글)
  COMMENT_CREATED: 'commentCreated',
  COMMENT_UPDATED: 'commentUpdated',
  COMMENT_DELETED: 'commentDeleted',

  // 공통
  JOINED_TEAM: 'joinedTeam',
  LEFT_TEAM: 'leftTeam',
  ERROR: 'error',
} as const;

export type TeamSocketEvent = (typeof TeamSocketEvents)[keyof typeof TeamSocketEvents];

// ===== 이벤트 페이로드 타입 =====

/** 태스크 생성 이벤트 */
export interface TaskCreatedPayload {
  taskId: number;
  teamId: number;
  taskName: string;
  taskDescription: string | null;
  taskStatus: number;
  actStatus: number;
  startAt: string | null;
  endAt: string | null;
  createdBy: number;
}

/** 태스크 수정 이벤트 */
export interface TaskUpdatedPayload {
  taskId: number;
  teamId: number;
  taskName?: string;
  taskDescription?: string | null;
  taskStatus?: number;
  startAt?: string | null;
  endAt?: string | null;
  updatedBy: number;
}

/** 태스크 상태 변경 이벤트 */
export interface TaskStatusChangedPayload {
  taskId: number;
  teamId: number;
  oldStatus: number;
  newStatus: number;
  updatedBy: number;
}

/** 태스크 활성 상태 변경 이벤트 */
export interface TaskActiveStatusChangedPayload {
  taskId: number;
  teamId: number;
  oldActStatus: number;
  newActStatus: number;
  updatedBy: number;
}

/** 태스크 삭제 이벤트 */
export interface TaskDeletedPayload {
  taskId: number;
  teamId: number;
  deletedBy: number;
}

/** 댓글 생성 이벤트 */
export interface CommentCreatedPayload {
  commentId: number;
  taskId: number;
  teamId: number;
  userId: number;
  userName: string | null;
  commentContent: string;
  crtdAt: string;
}

/** 댓글 수정 이벤트 */
export interface CommentUpdatedPayload {
  commentId: number;
  taskId: number;
  teamId: number;
  commentContent: string;
  mdfdAt: string;
  updatedBy: number;
}

/** 댓글 삭제 이벤트 */
export interface CommentDeletedPayload {
  commentId: number;
  taskId: number;
  teamId: number;
  deletedBy: number;
}

/** Room 참가 성공 응답 */
export interface JoinedTeamPayload {
  teamId: number;
  room: string;
}

/** Room 퇴장 성공 응답 */
export interface LeftTeamPayload {
  teamId: number;
  room: string;
}

/** 에러 이벤트 */
export interface SocketErrorPayload {
  code: string;
  message: string;
  timestamp?: string;
}

// ===== Socket 타입 정의 =====

/** Server → Client 이벤트 타입 맵 */
export interface ServerToClientEvents {
  [TeamSocketEvents.TASK_CREATED]: (payload: TaskCreatedPayload) => void;
  [TeamSocketEvents.TASK_UPDATED]: (payload: TaskUpdatedPayload) => void;
  [TeamSocketEvents.TASK_STATUS_CHANGED]: (payload: TaskStatusChangedPayload) => void;
  [TeamSocketEvents.TASK_ACTIVE_STATUS_CHANGED]: (payload: TaskActiveStatusChangedPayload) => void;
  [TeamSocketEvents.TASK_DELETED]: (payload: TaskDeletedPayload) => void;
  [TeamSocketEvents.COMMENT_CREATED]: (payload: CommentCreatedPayload) => void;
  [TeamSocketEvents.COMMENT_UPDATED]: (payload: CommentUpdatedPayload) => void;
  [TeamSocketEvents.COMMENT_DELETED]: (payload: CommentDeletedPayload) => void;
  [TeamSocketEvents.JOINED_TEAM]: (payload: JoinedTeamPayload) => void;
  [TeamSocketEvents.LEFT_TEAM]: (payload: LeftTeamPayload) => void;
  [TeamSocketEvents.ERROR]: (payload: SocketErrorPayload) => void;
}

/** Client → Server 이벤트 타입 맵 */
export interface ClientToServerEvents {
  [TeamSocketEvents.JOIN_TEAM]: (
    data: { teamId: number },
    callback?: (response: JoinedTeamPayload) => void,
  ) => void;
  [TeamSocketEvents.LEAVE_TEAM]: (
    data: { teamId: number },
    callback?: (response: LeftTeamPayload) => void,
  ) => void;
}

/** 타입 안전한 Socket 인스턴스 */
export type TeamSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
