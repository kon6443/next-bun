/**
 * 대전 방 공통 계약 — 테트리스 대전(`/tetris-battle`)과 포트리스(`/fortress`)가 같은 방 코어(백엔드 game-room, F3)를 쓴다
 * 이벤트명·에러 코드·입력 한도가 두 계약에서 같다(게임별 사본 `@/types/tetrisBattleSocket`·`@/types/fortressSocket`).
 * 같은지는 `roomContract.test.ts`가 고정한다 — 한쪽 계약이 바뀌면 그 테스트가 먼저 깨진다
 */

/** 방 코어 클라이언트 → 서버 (게임별 이벤트는 각 계약에) */
export const RoomClientEvents = {
  LIST_ROOMS: 'listRooms',
  CREATE_ROOM: 'createRoom',
  JOIN_ROOM: 'joinRoom',
  LEAVE_ROOM: 'leaveRoom',
  SET_READY: 'setReady',
  CHAT: 'chat',
  EMOTE: 'emote',
  START_MATCH: 'startMatch',
  REMATCH: 'rematch',
  HEARTBEAT: 'heartbeat',
  KICK_PLAYER: 'kickPlayer',
  /** 로비 전체 채팅(tetris-chat·D-016) — 게임마다 채널이 다르고 이벤트명은 같다 */
  JOIN_LOBBY_CHAT: 'joinLobbyChat',
  LEAVE_LOBBY_CHAT: 'leaveLobbyChat',
  LOBBY_CHAT: 'lobbyChat',
} as const;

/** 방 코어 서버 → 클라이언트 */
export const RoomServerEvents = {
  ROOMS_CHANGED: 'roomsChanged',
  ROOM_STATE: 'roomState',
  CHAT_MESSAGE: 'chatMessage',
  EMOTE_RECEIVED: 'emoteReceived',
  SESSION_REPLACED: 'sessionReplaced',
  PRESENCE_PING: 'presencePing',
  LOBBY_CHAT_MESSAGE: 'lobbyChatMessage',
  KICKED: 'kicked',
} as const;

/** 두 게임이 함께 갖는 에러 코드 — 게임별 코드(PLAYER_NOT_ALIVE, NOT_YOUR_TURN 등)는 각 계약에 */
export const RoomErrorCodes = {
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_WRONG_PASSWORD: 'ROOM_WRONG_PASSWORD',
  ROOM_PASSWORD_LOCKED: 'ROOM_PASSWORD_LOCKED',
  NOT_HOST: 'NOT_HOST',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  MATCH_ALREADY_STARTED: 'MATCH_ALREADY_STARTED',
  MATCH_NOT_FOUND: 'MATCH_NOT_FOUND',
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
  NOT_ALL_READY: 'NOT_ALL_READY',
  NAME_INVALID: 'NAME_INVALID',
  NAME_FORBIDDEN: 'NAME_FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_PLAYER_TOKEN: 'INVALID_PLAYER_TOKEN',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  ROOM_NAME_INVALID: 'ROOM_NAME_INVALID',
  ROOM_NAME_FORBIDDEN: 'ROOM_NAME_FORBIDDEN',
  CHAT_FORBIDDEN: 'CHAT_FORBIDDEN',
  ROOM_BUSY: 'ROOM_BUSY',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SEAT_IN_USE: 'SEAT_IN_USE',
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  LOBBY_CHAT_NOT_JOINED: 'LOBBY_CHAT_NOT_JOINED',
} as const;

export type RoomErrorCode = (typeof RoomErrorCodes)[keyof typeof RoomErrorCodes];

export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_MIN_PLAYERS = 2;
export const ROOM_NAME_MAX_LENGTH = 20;
export const ROOM_PASSWORD_MIN_LENGTH = 1;
export const ROOM_PASSWORD_MAX_LENGTH = 20;
export const CHAT_TEXT_MAX_LENGTH = 100;

export const BATTLE_EMOTE_IDS = ['gg', 'nice', 'wow', 'laugh', 'cry', 'angry'] as const;
export type BattleEmoteId = (typeof BATTLE_EMOTE_IDS)[number];

export type RoomStatus = 'WAITING' | 'PLAYING' | 'RESULT';

/** 방 안 플레이어 공통 필드 — 게임별 값(테트리스 skins, 포트리스 extra)은 각 계약 타입이 더한다 */
export interface BaseRoomPlayer {
  playerId: string;
  name: string;
  ready: boolean;
  connected: boolean;
  isGuest: boolean;
}

/** players는 입장 순서 */
export interface BaseRoomState<P extends BaseRoomPlayer = BaseRoomPlayer> {
  code: string;
  name: string;
  maxPlayers: number;
  locked: boolean;
  hostId: string;
  status: RoomStatus;
  players: P[];
}

export interface BaseRoomSummary {
  code: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  locked: boolean;
  status: RoomStatus;
}

/** createRoom·joinRoom 공통 ack — 재연결 복구(rejoin)는 게임별 모양 */
export interface BaseEnterRoomAckData<R extends BaseRoomState = BaseRoomState, J = unknown> {
  room: R;
  playerId: string;
  playerToken: string;
  rejoin?: J;
}

export interface ChatMessagePayload {
  playerId: string;
  name: string;
  text: string;
  /** ISO 8601 (UTC) */
  at: string;
}

export interface EmoteReceivedPayload {
  playerId: string;
  emoteId: BattleEmoteId;
  /** ISO 8601 (UTC) */
  at: string;
}

export type RoomAck<T, C extends string = string> = { ok: true; data: T } | { ok: false; code: C; message: string };

/** 로비 채팅 글 — 두 게임 계약의 LobbyChatMessage와 같은 모양 */
export interface LobbyChatMessage {
  id: string;
  /** 차단용 불투명 키 — 같은 사람이면 같은 값 */
  senderKey: string;
  name: string;
  isGuest: boolean;
  text: string;
  /** ISO 8601 (UTC) */
  at: string;
}

/** joinLobbyChat ack — 최근 대화·참여 수·내 표시 */
export interface JoinLobbyChatAckData {
  messages: LobbyChatMessage[];
  onlineCount: number | null;
  me: { isGuest: boolean; name: string | null; senderKey: string };
}
