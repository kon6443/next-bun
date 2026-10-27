import type { Socket } from 'socket.io-client';

/**
 * 테트리스 대전 소켓 계약 사본 — namespace `/tetris-battle`
 * 정본: 백엔드 `src/modules/tetris-battle/tetris-battle.events.ts` (DESIGN §16 프로토콜 v1). 이름·값·필드는 정본과 같게 유지한다
 * 요청 페이로드(*Payload 요청 타입)는 정본 파일에 없어 DESIGN §16 표를 옮겼다
 */

export const TETRIS_BATTLE_NAMESPACE = '/tetris-battle';

// ===== 이벤트명 =====

/** 클라이언트 → 서버. 모든 핸들러는 ack로 `TetrisBattleAck`을 돌려준다 */
export const TetrisBattleClientEvents = {
  LIST_ROOMS: 'listRooms',
  CREATE_ROOM: 'createRoom',
  JOIN_ROOM: 'joinRoom',
  LEAVE_ROOM: 'leaveRoom',
  SET_READY: 'setReady',
  CHAT: 'chat',
  EMOTE: 'emote',
  // P2
  START_MATCH: 'startMatch',
  REMATCH: 'rematch',
  LOCK: 'lock',
  TOP_OUT: 'topOut',
  /** 방 안에서 presencePing을 받을 때마다 — ack 없음 (D-010·D-012) */
  HEARTBEAT: 'heartbeat',
  /** 방장 — 대기·결과 단계에서 다른 참가자를 내보낸다 (D-011) */
  KICK_PLAYER: 'kickPlayer',
  /** 로비 전체 채팅 구독 — ack로 최근 글(≤50, 30분 이내)·내 정보·참여자 수 (tetris-chat). 재연결 뒤에는 다시 보낸다(서버가 자동으로 다시 넣지 않는다) */
  JOIN_LOBBY_CHAT: 'joinLobbyChat',
  LEAVE_LOBBY_CHAT: 'leaveLobbyChat',
  /** 로비 채팅 보내기 — join 전이면 LOBBY_CHAT_NOT_JOINED. 서버가 보낸 사람 포함 전원에게 lobbyChatMessage로 방송 */
  LOBBY_CHAT: 'lobbyChat',
} as const;

/** 서버 → 클라이언트 */
export const TetrisBattleServerEvents = {
  ROOMS_CHANGED: 'roomsChanged',
  ROOM_STATE: 'roomState',
  CHAT_MESSAGE: 'chatMessage',
  EMOTE_RECEIVED: 'emoteReceived',
  // P2
  MATCH_STARTING: 'matchStarting',
  GARBAGE: 'garbage',
  ATTACK: 'attack',
  OPPONENT_UPDATE: 'opponentUpdate',
  PLAYER_KO: 'playerKO',
  MATCH_ENDED: 'matchEnded',
  /** 내 자리를 다른 탭·기기가 넘겨받았다 — 넘겨받힌 이전 소켓에만 (D-007) */
  SESSION_REPLACED: 'sessionReplaced',
  /** 서버가 4초마다 — 방 안이면 곧바로 heartbeat로 답한다(숨긴 탭의 타이머 제한을 피한다, D-012). 페이로드 없음 */
  PRESENCE_PING: 'presencePing',
  /** 방장이 나를 내보냈다 — 내보내진 소켓에만. 토큰은 서버에서 이미 무효 (D-011) */
  KICKED: 'kicked',
  /** 로비 채팅 글 — 구독 중인 소켓 전원(보낸 사람 포함) */
  LOBBY_CHAT_MESSAGE: 'lobbyChatMessage',
} as const;

// ===== 에러 코드 =====

export const TetrisBattleErrorCodes = {
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
  /** 이미 탈락한 플레이어의 lock (탈락 후 늦게 도착한 보고) */
  PLAYER_NOT_ALIVE: 'PLAYER_NOT_ALIVE',
  /** 넘겨받을 자리가 다른 탭·기기에서 경기 중 (D-007) */
  SEAT_IN_USE: 'SEAT_IN_USE',
  /** 내보낼 대상이 없거나 방장 자신 (D-011) */
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  /** 로비 채팅을 구독하지 않은 소켓의 lobbyChat (tetris-chat) */
  LOBBY_CHAT_NOT_JOINED: 'LOBBY_CHAT_NOT_JOINED',
} as const;

export type TetrisBattleErrorCode = (typeof TetrisBattleErrorCodes)[keyof typeof TetrisBattleErrorCodes];

// ===== 공통 타입 =====

export const ROOM_STATUSES = ['WAITING', 'PLAYING', 'RESULT'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

/** 로비 목록 한 줄 — 비밀번호 방은 `locked: true`만 보인다 */
export interface RoomSummary {
  code: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  locked: boolean;
  status: RoomStatus;
}

export interface RoomPlayer {
  /** 방 내 고유 id (`p1`, `p2`, …) */
  playerId: string;
  name: string;
  ready: boolean;
  /** false = 소켓이 끊겨 재연결 유예 중 */
  connected: boolean;
  isGuest: boolean;
  /** 보드 스킨(D-003) — 입장 때 서버가 계정 장착을 붙인다(게스트 전부 default). 이전 서버면 없다 → default로 그린다 */
  skins?: { block: string; effect: string; board: string; levels?: { block: number; effect: number; board: number } };
}

/** players는 입장 순서 */
export interface RoomState {
  code: string;
  name: string;
  maxPlayers: number;
  locked: boolean;
  hostId: string;
  status: RoomStatus;
  players: RoomPlayer[];
}

export type TetrisBattleAck<T> = { ok: true; data: T } | { ok: false; code: TetrisBattleErrorCode; message: string };

// ===== 요청 페이로드 =====

export interface CreateRoomPayload {
  name: string;
  maxPlayers: number;
  password?: string;
  playerName: string;
  /** 이 탭의 식별자 — 경기 중 같은 탭의 재연결만 자리를 넘겨받는다 (D-007, `/^[A-Za-z0-9-]{1,64}$/`) */
  tabId?: string;
  /** presencePing에 답하는 클라이언트라는 선언 — 늘 true (D-010) */
  heartbeat?: true;
}

export interface JoinRoomPayload {
  code: string;
  password?: string;
  playerName: string;
  /** 재연결 — 같은 playerId로 복귀 */
  playerToken?: string;
  /** 재연결 — 이 id 이후의 가비지를 ack rejoin.missedGarbage로 받는다 (P2) */
  lastGarbageId?: number;
  /** 이 탭의 식별자 — CreateRoomPayload.tabId와 같다 */
  tabId?: string;
  /** CreateRoomPayload.heartbeat와 같다 */
  heartbeat?: true;
}

export interface KickPlayerPayload {
  code: string;
  playerId: string;
}

export interface RoomCodePayload {
  code: string;
}

export interface SetReadyPayload {
  code: string;
  ready: boolean;
}

export interface ChatPayload {
  code: string;
  text: string;
}

export interface EmotePayload {
  code: string;
  emoteId: TetrisBattleEmoteId;
}

export type TSpinReport = 'none' | 'mini' | 'full';

/** P2 — 블록 고정마다 */
export interface LockPayload {
  matchId: string;
  /** = game.pieces (재전송 중복 제거) */
  seq: number;
  frame: number;
  /** 상쇄 후 보낼 줄 */
  sent: number;
  combo: number;
  b2b: boolean;
  tSpin: TSpinReport;
  lines: number;
  pc: boolean;
  /** 보이는 판 200칸 base64 */
  board: string;
  /** 대기열에 남은 줄 */
  pending: number;
}

export interface TopOutPayload {
  matchId: string;
  frame: number;
}

// ===== ack data =====

export interface ListRoomsAckData {
  rooms: RoomSummary[];
}

/** createRoom·joinRoom 공통. `playerToken`은 재연결용 비밀값 */
export interface EnterRoomAckData {
  room: RoomState;
  playerId: string;
  playerToken: string;
  rejoin?: RejoinData;
}

/** 재연결 복구 — playerToken으로 들어왔고 방에 매치가 있을 때만 */
export interface RejoinData {
  match: { matchId: string; seed: number; status: 'PLAYING' | 'ENDED'; alive: boolean };
  /** 받은 가비지 중 id > lastGarbageId (오래된 순) */
  missedGarbage: GarbagePayload[];
  opponents: { playerId: string; board: string; pending: number; alive: boolean }[];
}

export type EmptyAckData = Record<string, never>;

/** lock ack — 다음 공격 대상(생존 상대가 없으면 null) */
export interface LockAckData {
  targetId: string | null;
}

// ===== 서버 → 클라이언트 페이로드 =====

export interface RoomsChangedPayload {
  rooms: RoomSummary[];
}

// ===== 로비 채팅 (tetris-chat) =====

/**
 * 로비 채팅 글 — 저장하지 않고 서버 메모리(Redis)에 최근 50개를 30분만 둔다
 * senderKey: 차단용 불투명 키(같은 사람이면 같은 값 — 로그인은 계정, 게스트는 접속 IP 기준. 신원은 알 수 없다)
 * name: 로그인이면 서버가 계정 이름으로, 게스트는 보낸 이름(회원 이름과 같을 수 있다 — 게스트 표시로 구분한다)
 * text·name은 HTML 이스케이프 없이 온다 — 반드시 글자로만 그린다
 */
export interface LobbyChatMessage {
  id: string;
  senderKey: string;
  name: string;
  isGuest: boolean;
  text: string;
  /** ISO 8601 (UTC) */
  at: string;
}

export interface JoinLobbyChatAckData {
  /** 오래된 것 → 최신, ≤50, 30분 이내 */
  messages: LobbyChatMessage[];
  /** 게스트면 name null — 보낼 때 이름을 함께 보낸다 */
  me: { isGuest: boolean; name: string | null };
  /** 그 시점 로비 채팅 참여 소켓 수(전 서버 합) */
  onlineCount: number;
}

export interface LobbyChatPayload {
  /** 1~100자(코드포인트, trim 뒤). 줄바꿈·제어·bidi 문자는 CHAT_FORBIDDEN */
  text: string;
  /** 게스트만 — 로그인이면 무시된다. 대전 이름 정책(NAME_INVALID·NAME_FORBIDDEN) */
  name?: string;
}

export interface LobbyChatAckData {
  message: LobbyChatMessage;
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
  emoteId: TetrisBattleEmoteId;
  /** ISO 8601 (UTC) */
  at: string;
}

export interface SessionReplacedPayload {
  code: string;
}

export interface KickedPayload {
  code: string;
}

/** P2 */
export interface MatchStartingPayload {
  matchId: string;
  seed: number;
  /** 서버 기준 남은 ms — 수신 시각 + startInMs로 카운트다운 */
  startInMs: number;
  /** 참고용 (기기 시계가 틀릴 수 있다) */
  startAt: string;
  /** 참가자 (입장 순서) */
  players: { playerId: string; name: string }[];
}

export interface GarbagePayload {
  matchId: string;
  /** 받는 플레이어 기준 단조 증가 정수 */
  id: number;
  lines: number;
  hole: number;
  from: string;
}

export interface AttackPayload {
  matchId: string;
  from: string;
  to: string;
  lines: number;
}

export interface OpponentUpdatePayload {
  matchId: string;
  playerId: string;
  board: string;
  pending: number;
  combo: number;
  b2b: boolean;
}

export type KoReason = 'topout' | 'disconnect' | 'leave';

export interface PlayerKOPayload {
  matchId: string;
  playerId: string;
  by: string | null;
  place: number;
  reason: KoReason;
}

export interface MatchResultEntry {
  playerId: string;
  name: string;
  place: number;
  kos: number;
  sent: number;
  received: number;
  pieces: number;
  maxCombo: number;
  frames: number;
}

export interface MatchEndedPayload {
  matchId: string;
  results: MatchResultEntry[];
}

// ===== 상수 =====

export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_MIN_PLAYERS = 2;
export const ROOM_MAX_PLAYERS = 4;
export const ROOM_NAME_MAX_LENGTH = 20;
export const ROOM_PASSWORD_MIN_LENGTH = 1;
export const ROOM_PASSWORD_MAX_LENGTH = 20;
export const CHAT_TEXT_MAX_LENGTH = 100;

export const TETRIS_BATTLE_EMOTE_IDS = ['gg', 'nice', 'wow', 'laugh', 'cry', 'angry'] as const;
export type TetrisBattleEmoteId = (typeof TETRIS_BATTLE_EMOTE_IDS)[number];

/** 판 인코딩 — 보이는 20행(판 좌표 20~39, 위→아래) × 10열, 칸당 1바이트(0 빈칸·1~7 블록·8 가비지) → base64 */
export const BOARD_COLS = 10;
export const BOARD_VISIBLE_ROWS = 20;
export const BOARD_VISIBLE_ROW_OFFSET = 20;
export const BOARD_BYTES = BOARD_COLS * BOARD_VISIBLE_ROWS;
export const BOARD_BASE64_LENGTH = Math.ceil(BOARD_BYTES / 3) * 4;
export const BOARD_CELL_EMPTY = 0;
/** 칸 값 최대 — 이보다 큰 값은 거부 (가비지 8 포함) */
export const BOARD_CELL_MAX = 8;
export const BOARD_CELL_GARBAGE = 8;

// ===== Socket 타입 =====

type Ack<T> = (response: TetrisBattleAck<T>) => void;

export interface TetrisBattleServerToClientEvents {
  [TetrisBattleServerEvents.ROOMS_CHANGED]: (payload: RoomsChangedPayload) => void;
  [TetrisBattleServerEvents.ROOM_STATE]: (payload: RoomState) => void;
  [TetrisBattleServerEvents.CHAT_MESSAGE]: (payload: ChatMessagePayload) => void;
  [TetrisBattleServerEvents.EMOTE_RECEIVED]: (payload: EmoteReceivedPayload) => void;
  [TetrisBattleServerEvents.MATCH_STARTING]: (payload: MatchStartingPayload) => void;
  [TetrisBattleServerEvents.GARBAGE]: (payload: GarbagePayload) => void;
  [TetrisBattleServerEvents.ATTACK]: (payload: AttackPayload) => void;
  [TetrisBattleServerEvents.OPPONENT_UPDATE]: (payload: OpponentUpdatePayload) => void;
  [TetrisBattleServerEvents.PLAYER_KO]: (payload: PlayerKOPayload) => void;
  [TetrisBattleServerEvents.MATCH_ENDED]: (payload: MatchEndedPayload) => void;
  [TetrisBattleServerEvents.SESSION_REPLACED]: (payload: SessionReplacedPayload) => void;
  [TetrisBattleServerEvents.PRESENCE_PING]: () => void;
  [TetrisBattleServerEvents.KICKED]: (payload: KickedPayload) => void;
  [TetrisBattleServerEvents.LOBBY_CHAT_MESSAGE]: (payload: LobbyChatMessage) => void;
}

export interface TetrisBattleClientToServerEvents {
  [TetrisBattleClientEvents.LIST_ROOMS]: (payload: Record<string, never>, ack: Ack<ListRoomsAckData>) => void;
  [TetrisBattleClientEvents.CREATE_ROOM]: (payload: CreateRoomPayload, ack: Ack<EnterRoomAckData>) => void;
  [TetrisBattleClientEvents.JOIN_ROOM]: (payload: JoinRoomPayload, ack: Ack<EnterRoomAckData>) => void;
  [TetrisBattleClientEvents.LEAVE_ROOM]: (payload: RoomCodePayload, ack: Ack<EmptyAckData>) => void;
  [TetrisBattleClientEvents.SET_READY]: (payload: SetReadyPayload, ack: Ack<EmptyAckData>) => void;
  [TetrisBattleClientEvents.CHAT]: (payload: ChatPayload, ack: Ack<EmptyAckData>) => void;
  [TetrisBattleClientEvents.EMOTE]: (payload: EmotePayload, ack: Ack<EmptyAckData>) => void;
  [TetrisBattleClientEvents.START_MATCH]: (payload: RoomCodePayload, ack: Ack<EmptyAckData>) => void;
  [TetrisBattleClientEvents.REMATCH]: (payload: RoomCodePayload, ack: Ack<EmptyAckData>) => void;
  [TetrisBattleClientEvents.LOCK]: (payload: LockPayload, ack: Ack<LockAckData>) => void;
  [TetrisBattleClientEvents.TOP_OUT]: (payload: TopOutPayload, ack: Ack<EmptyAckData>) => void;
  [TetrisBattleClientEvents.HEARTBEAT]: (payload: RoomCodePayload) => void;
  [TetrisBattleClientEvents.KICK_PLAYER]: (payload: KickPlayerPayload, ack: Ack<EmptyAckData>) => void;
  [TetrisBattleClientEvents.JOIN_LOBBY_CHAT]: (payload: Record<string, never>, ack: Ack<JoinLobbyChatAckData>) => void;
  [TetrisBattleClientEvents.LEAVE_LOBBY_CHAT]: (payload: Record<string, never>, ack: Ack<EmptyAckData>) => void;
  [TetrisBattleClientEvents.LOBBY_CHAT]: (payload: LobbyChatPayload, ack: Ack<LobbyChatAckData>) => void;
}

export type TetrisBattleSocket = Socket<TetrisBattleServerToClientEvents, TetrisBattleClientToServerEvents>;
