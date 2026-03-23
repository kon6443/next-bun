import type { Socket } from 'socket.io-client';

// ===== 이벤트 상수 (백엔드 fishing.events.ts와 동일) =====

export const FishingSocketEvents = {
  // Client → Server
  JOIN_MAP: 'joinMap',
  LEAVE_MAP: 'leaveMap',
  MOVE: 'move',
  FISHING_STATE: 'fishingState',
  CHAT_MESSAGE: 'chatMessage',
  CATCH_RESULT: 'catchResult',

  // Server → Client
  PLAYER_MOVED: 'playerMoved',
  PLAYER_FISHING_STATE: 'playerFishingState',
  CHAT_RECEIVED: 'chatReceived',
  CATCH_NOTIFICATION: 'catchNotification',
  USER_JOINED: 'userJoined',
  USER_LEFT: 'userLeft',
  ONLINE_USERS: 'onlineUsers',
  PLAYER_POSITIONS: 'playerPositions',

  // 공통
  JOINED_MAP: 'joinedMap',
  LEFT_MAP: 'leftMap',
  ERROR: 'error',
} as const;

// ===== 위치 타입 =====

export interface PlayerPosition {
  x: number;
  y: number;
  direction: 'left' | 'right';
}

// ===== Client → Server 페이로드 =====

export interface JoinMapPayload {
  mapId: string;
}

export interface LeaveMapPayload {
  mapId: string;
}

export interface MovePayload {
  x: number;
  y: number;
  direction: 'left' | 'right';
}

export interface FishingStatePayload {
  state: 'idle' | 'casting' | 'waiting' | 'bite' | 'challenge' | 'success' | 'fail';
  pointId?: string;
}

export interface ChatMessagePayload {
  message: string;
}

export interface CatchResultPayload {
  fishName: string;
  grade: string;
  size: number;
  weight: number;
}

// ===== Server → Client 페이로드 =====

export interface PlayerMovedPayload {
  userId: number;
  userName: string;
  x: number;
  y: number;
  direction: 'left' | 'right';
  timestamp: number;
}

export interface PlayerFishingStatePayload {
  userId: number;
  userName: string;
  state: 'idle' | 'casting' | 'waiting' | 'bite' | 'challenge' | 'success' | 'fail';
  pointId?: string;
}

export interface ChatReceivedPayload {
  userId: number;
  userName: string;
  message: string;
  timestamp: string;
}

export interface CatchNotificationPayload {
  userId: number;
  userName: string;
  fishName: string;
  grade: string;
  size: number;
  weight: number;
  timestamp: string;
}

export interface FishingUserJoinedPayload {
  userId: number;
  userName: string;
  connectionCount: number;
  totalOnlineCount: number;
  position?: PlayerPosition;
}

export interface FishingUserLeftPayload {
  userId: number;
  userName: string;
  connectionCount: number;
  totalOnlineCount: number;
}

export interface FishingOnlineUserInfo {
  userId: number;
  userName: string;
  connectionCount: number;
  position?: PlayerPosition;
  fishingState?: string;
}

export interface FishingOnlineUsersPayload {
  mapId: string;
  users: FishingOnlineUserInfo[];
  totalCount: number;
}

export interface PlayerPositionsPayload {
  positions: Record<number, PlayerPosition & { userName: string; fishingState?: string }>;
}

export interface JoinedMapPayload {
  mapId: string;
  room: string;
}

export interface LeftMapPayload {
  mapId: string;
  room: string;
}

export interface FishingErrorPayload {
  code: string;
  message: string;
}

// ===== Socket 타입 정의 =====

export interface FishingServerToClientEvents {
  [FishingSocketEvents.PLAYER_MOVED]: (payload: PlayerMovedPayload) => void;
  [FishingSocketEvents.PLAYER_FISHING_STATE]: (payload: PlayerFishingStatePayload) => void;
  [FishingSocketEvents.CHAT_RECEIVED]: (payload: ChatReceivedPayload) => void;
  [FishingSocketEvents.CATCH_NOTIFICATION]: (payload: CatchNotificationPayload) => void;
  [FishingSocketEvents.USER_JOINED]: (payload: FishingUserJoinedPayload) => void;
  [FishingSocketEvents.USER_LEFT]: (payload: FishingUserLeftPayload) => void;
  [FishingSocketEvents.ONLINE_USERS]: (payload: FishingOnlineUsersPayload) => void;
  [FishingSocketEvents.PLAYER_POSITIONS]: (payload: PlayerPositionsPayload) => void;
  [FishingSocketEvents.ERROR]: (payload: FishingErrorPayload) => void;
}

export interface FishingClientToServerEvents {
  [FishingSocketEvents.JOIN_MAP]: (
    payload: JoinMapPayload,
    callback?: (response: JoinedMapPayload) => void,
  ) => void;
  [FishingSocketEvents.LEAVE_MAP]: (
    payload: LeaveMapPayload,
    callback?: (response: LeftMapPayload) => void,
  ) => void;
  [FishingSocketEvents.MOVE]: (payload: MovePayload) => void;
  [FishingSocketEvents.FISHING_STATE]: (payload: FishingStatePayload) => void;
  [FishingSocketEvents.CHAT_MESSAGE]: (payload: ChatMessagePayload) => void;
  [FishingSocketEvents.CATCH_RESULT]: (payload: CatchResultPayload) => void;
}

export type FishingSocket = Socket<FishingServerToClientEvents, FishingClientToServerEvents>;
