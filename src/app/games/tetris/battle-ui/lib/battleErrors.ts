import type { TetrisBattleErrorCode } from '@/types/tetrisBattleSocket';

/** 서버 에러 코드 + 클라이언트 쪽 실패(응답 없음·연결 끊김) */
export type BattleRequestErrorCode = TetrisBattleErrorCode | 'TIMEOUT' | 'DISCONNECTED';

const MESSAGES: Record<BattleRequestErrorCode, string> = {
  ROOM_NOT_FOUND: '방을 찾을 수 없어요. 코드를 확인하거나 방 목록을 새로고침해 주세요.',
  ROOM_FULL: '방이 가득 찼어요.',
  ROOM_WRONG_PASSWORD: '비밀번호가 맞지 않아요.',
  ROOM_PASSWORD_LOCKED: '비밀번호를 여러 번 틀려 잠시 입장할 수 없어요. 조금 뒤에 다시 시도해 주세요.',
  NOT_HOST: '방장만 할 수 있어요.',
  NOT_IN_ROOM: '방에 들어가 있지 않아요. 다시 입장해 주세요.',
  MATCH_ALREADY_STARTED: '이미 게임이 진행 중이에요.',
  MATCH_NOT_FOUND: '진행 중인 게임을 찾을 수 없어요.',
  NOT_ENOUGH_PLAYERS: '2명 이상 모여야 시작할 수 있어요.',
  NOT_ALL_READY: '모두 준비해야 시작할 수 있어요.',
  NAME_INVALID: '이름은 12자까지, 완성된 한글·영문·숫자·공백·_·-만 쓸 수 있어요.',
  NAME_FORBIDDEN: '쓸 수 없는 이름이에요. 다른 이름을 입력해 주세요.',
  RATE_LIMITED: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',
  INVALID_PLAYER_TOKEN: '이전 입장 정보가 만료됐어요. 다시 입장해 주세요.',
  INVALID_PAYLOAD: '입력값을 확인해 주세요.',
  ROOM_NAME_INVALID: '방 이름은 1~20자로 입력해 주세요.',
  ROOM_NAME_FORBIDDEN: '쓸 수 없는 방 이름이에요.',
  CHAT_FORBIDDEN: '보낼 수 없는 내용이 있어요.',
  ROOM_BUSY: '방이 바빠요. 잠시 후 다시 시도해 주세요.',
  SERVICE_UNAVAILABLE: '지금은 대전을 이용할 수 없어요. 잠시 후 다시 시도해 주세요.',
  INTERNAL_ERROR: '문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
  PLAYER_NOT_ALIVE: '이미 탈락했어요.',
  SEAT_IN_USE: '다른 탭이나 기기에서 이 방의 경기를 하고 있어요. 경기가 끝나면 들어올 수 있어요.',
  PLAYER_NOT_FOUND: '그 플레이어는 방에 없어요.',
  LOBBY_CHAT_NOT_JOINED: '채팅에 다시 들어가는 중이에요. 잠시 후 다시 보내 주세요.',
  TIMEOUT: '서버 응답이 없어요. 연결 상태를 확인해 주세요.',
  DISCONNECTED: '서버와 연결되지 않았어요. 다시 연결하는 중이에요.',
};

/** 코드 → 한국어 안내. 모르는 코드면 서버 메시지 대신 일반 문구(서버 메시지는 영어일 수 있다) */
export function battleErrorMessage(code: string): string {
  return (MESSAGES as Record<string, string>)[code] ?? MESSAGES.INTERNAL_ERROR;
}
