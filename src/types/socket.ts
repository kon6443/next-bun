import type { Socket } from 'socket.io-client';
import type { TaskTag } from '@/app/types/task';

// ===== 이벤트 상수 (백엔드와 동기화) =====

export const TeamSocketEvents = {
  // Client → Server
  JOIN_TEAM: 'joinTeam',
  LEAVE_TEAM: 'leaveTeam',
  CHAT_MESSAGE: 'chatMessage',
  CHAT_READ: 'chatRead',

  // Server → Client (태스크)
  TASK_CREATED: 'taskCreated',
  TASK_UPDATED: 'taskUpdated',
  TASK_STATUS_CHANGED: 'taskStatusChanged',
  TASK_ACTIVE_STATUS_CHANGED: 'taskActiveStatusChanged',
  TASK_DELETED: 'taskDeleted',

  // Server → Client (팀 태그)
  TAG_CREATED: 'tagCreated',
  TAG_UPDATED: 'tagUpdated',
  TAG_DELETED: 'tagDeleted',
  TAGS_REORDERED: 'tagsReordered',

  // Server → Client (댓글)
  COMMENT_CREATED: 'commentCreated',
  COMMENT_UPDATED: 'commentUpdated',
  COMMENT_DELETED: 'commentDeleted',

  // Server → Client (온라인 유저)
  USER_JOINED: 'userJoined',
  USER_LEFT: 'userLeft',
  ONLINE_USERS: 'onlineUsers',

  // Server → Client (멤버 역할/상태)
  MEMBER_ROLE_CHANGED: 'memberRoleChanged',
  MEMBER_STATUS_CHANGED: 'memberStatusChanged',
  MEMBER_JOINED: 'memberJoined',

  // Server → Client (채팅)
  CHAT_RECEIVED: 'chatReceived',
  CHAT_READ_UPDATED: 'chatReadUpdated',

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
  tags: TaskTag[];
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
  /** 태스크의 현재 태그 전체 (팀 태그 순서) — 서버는 항상 보낸다 (D-021) */
  tags?: TaskTag[];
  updatedBy: number;
}

/** 태스크 상태 변경 이벤트 */
export interface TaskStatusChangedPayload {
  taskId: number;
  teamId: number;
  oldStatus: number;
  newStatus: number;
  completedAt: string | null;
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

/** 팀 태그 생성 이벤트 (taskCount는 없다 — 새 태그는 0) */
export interface TagCreatedPayload extends TaskTag {
  teamId: number;
  sortOrder: number;
  createdBy: number;
}

/** 팀 태그 이름·색 수정 이벤트 */
export interface TagUpdatedPayload extends TaskTag {
  teamId: number;
  sortOrder: number;
  updatedBy: number;
}

/** 팀 태그 삭제 이벤트 (붙어 있던 태스크에서도 빠진다) */
export interface TagDeletedPayload {
  teamId: number;
  tagId: number;
  deletedBy: number;
}

/** 팀 태그 순서 변경 이벤트 — 팀 전체 태그 ID를 새 순서로 */
export interface TagsReorderedPayload {
  teamId: number;
  tagIds: number[];
  updatedBy: number;
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
  /** 채팅 전송 거부 시 대상 메시지의 clientMsgId (CHAT_* 에러) */
  clientMsgId?: string;
}

// ===== 온라인 유저 관련 타입 =====

/** 온라인 유저 정보 */
export interface OnlineUserInfo {
  userId: number;
  userName: string;
  connectionCount: number; // 같은 유저의 접속 수 (다중 탭)
}

/** 유저 접속 이벤트 */
export interface UserJoinedPayload {
  teamId: number;
  userId: number;
  userName: string;
  connectionCount: number;
  totalOnlineCount: number;
}

/** 유저 퇴장 이벤트 */
export interface UserLeftPayload {
  teamId: number;
  userId: number;
  userName: string;
  connectionCount: number; // 남은 접속 수 (0이면 완전히 오프라인)
  totalOnlineCount: number;
}

/** 온라인 유저 목록 */
export interface OnlineUsersPayload {
  teamId: number;
  users: OnlineUserInfo[];
  totalCount: number;
}

// ===== 멤버 역할 관련 타입 =====

/** 멤버 역할 변경 이벤트 */
export interface MemberRoleChangedPayload {
  teamId: number;
  userId: number;
  userName: string | null;
  previousRole: string;
  newRole: string;
  changedBy: number;
}

/** 멤버 상태 변경 이벤트 */
export interface MemberStatusChangedPayload {
  teamId: number;
  userId: number;
  userName: string | null;
  previousStatus: number;
  newStatus: number;
  changedBy: number;
}

/**
 * 멤버 가입 이벤트 (초대 수락 — 신규·재가입)
 *
 * lastReadMessageId는 가입 시점의 커서(팀 최신 메시지 ID)다.
 */
export interface MemberJoinedPayload {
  teamId: number;
  userId: number;
  userName: string;
  lastReadMessageId: number;
}

// ===== 채팅 관련 타입 =====

/**
 * 채팅 메시지 전송 페이로드 (Client → Server)
 *
 * teamId는 보내지 않음 — 서버가 소켓에 캐싱된 teamId로 room을 식별한다.
 * clientMsgId는 클라이언트가 생성한 메시지 식별자 (낙관적 업데이트 / 추후 저장 dedup 키).
 */
export interface ChatMessagePayload {
  message: string;
  clientMsgId: string;
}

/**
 * 채팅 메시지 수신 페이로드 (Server → Client)
 *
 * 두 형식을 모두 받는다 (배포 순서상 과도기 — 정규화는 teamChatUtils.normalizeChatIds):
 * - 옛 형식: messageId = clientMsgId 에코 (string), clientMsgId 필드 없음
 * - 새 형식: messageId = 서버 발급 ID (number), clientMsgId 별도 필드
 * timestamp는 서버가 생성한 ISO 문자열(UTC).
 */
export interface ChatReceivedPayload {
  messageId: string | number;
  clientMsgId?: string;
  teamId: number;
  userId: number;
  userName: string;
  message: string;
  timestamp: string;
}

/**
 * 채팅 읽음 위치 갱신 (Client → Server)
 *
 * 이 ID 이하의 메시지를 모두 읽었다는 뜻이다. 서버는 현재 커서보다 클 때만 반영한다.
 */
export interface ChatReadPayload {
  lastReadMessageId: number;
}

/**
 * 멤버 읽음 위치 갱신 알림 (Server → Client)
 *
 * 커서가 실제로 전진했을 때만 온다. 본인의 다른 탭 갱신도 포함된다.
 */
export interface ChatReadUpdatedPayload {
  teamId: number;
  userId: number;
  lastReadMessageId: number;
}

// ===== Socket 타입 정의 =====

/** Server → Client 이벤트 타입 맵 */
export interface ServerToClientEvents {
  [TeamSocketEvents.TASK_CREATED]: (payload: TaskCreatedPayload) => void;
  [TeamSocketEvents.TASK_UPDATED]: (payload: TaskUpdatedPayload) => void;
  [TeamSocketEvents.TASK_STATUS_CHANGED]: (payload: TaskStatusChangedPayload) => void;
  [TeamSocketEvents.TASK_ACTIVE_STATUS_CHANGED]: (payload: TaskActiveStatusChangedPayload) => void;
  [TeamSocketEvents.TASK_DELETED]: (payload: TaskDeletedPayload) => void;
  [TeamSocketEvents.TAG_CREATED]: (payload: TagCreatedPayload) => void;
  [TeamSocketEvents.TAG_UPDATED]: (payload: TagUpdatedPayload) => void;
  [TeamSocketEvents.TAG_DELETED]: (payload: TagDeletedPayload) => void;
  [TeamSocketEvents.TAGS_REORDERED]: (payload: TagsReorderedPayload) => void;
  [TeamSocketEvents.COMMENT_CREATED]: (payload: CommentCreatedPayload) => void;
  [TeamSocketEvents.COMMENT_UPDATED]: (payload: CommentUpdatedPayload) => void;
  [TeamSocketEvents.COMMENT_DELETED]: (payload: CommentDeletedPayload) => void;
  [TeamSocketEvents.USER_JOINED]: (payload: UserJoinedPayload) => void;
  [TeamSocketEvents.USER_LEFT]: (payload: UserLeftPayload) => void;
  [TeamSocketEvents.ONLINE_USERS]: (payload: OnlineUsersPayload) => void;
  [TeamSocketEvents.MEMBER_ROLE_CHANGED]: (payload: MemberRoleChangedPayload) => void;
  [TeamSocketEvents.MEMBER_STATUS_CHANGED]: (payload: MemberStatusChangedPayload) => void;
  [TeamSocketEvents.MEMBER_JOINED]: (payload: MemberJoinedPayload) => void;
  [TeamSocketEvents.CHAT_RECEIVED]: (payload: ChatReceivedPayload) => void;
  [TeamSocketEvents.CHAT_READ_UPDATED]: (payload: ChatReadUpdatedPayload) => void;
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
  [TeamSocketEvents.CHAT_MESSAGE]: (data: ChatMessagePayload) => void;
  [TeamSocketEvents.CHAT_READ]: (data: ChatReadPayload) => void;
}

/** 타입 안전한 Socket 인스턴스 */
export type TeamSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
