import {
  CHAT_TEXT_MAX_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_NAME_MAX_LENGTH,
  ROOM_PASSWORD_MAX_LENGTH,
  ROOM_PASSWORD_MIN_LENGTH,
} from '@/types/tetrisBattleSocket';

/**
 * 방 입력값 — 서버 규칙(계약 상수)과 같은 기준으로 미리 확인한다. 금칙어는 서버만 판정한다
 * 문제가 없으면 null, 있으면 한국어 안내
 */

const charLength = (value: string) => Array.from(value).length;

/** 앞뒤 공백 제거 + 연속 공백 1개 */
export function normalizeRoomName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function validateRoomName(raw: string): string | null {
  const name = normalizeRoomName(raw);
  if (name.length === 0) return '방 이름을 입력해 주세요.';
  if (charLength(name) > ROOM_NAME_MAX_LENGTH) return `방 이름은 ${ROOM_NAME_MAX_LENGTH}자까지예요.`;
  // 제어문자 금지는 서버 규칙과 같다
  if (/[\u0000-\u001f\u007f]/.test(name)) return '방 이름에 쓸 수 없는 문자가 있어요.';
  return null;
}

/** 비밀번호는 선택 — 빈 문자열이면 비밀번호 없는 방 */
export function validateRoomPassword(raw: string): string | null {
  if (raw.length === 0) return null;
  const length = charLength(raw);
  if (length < ROOM_PASSWORD_MIN_LENGTH || length > ROOM_PASSWORD_MAX_LENGTH) {
    return `비밀번호는 ${ROOM_PASSWORD_MIN_LENGTH}~${ROOM_PASSWORD_MAX_LENGTH}자로 입력해 주세요.`;
  }
  return null;
}

/** 입력한 방 코드 → 대문자·공백 제거. 형식이 아니면 null */
export function normalizeRoomCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** 보낼 채팅 — 앞뒤 공백 제거. 비었거나 길면 null */
export function normalizeChatText(raw: string): string | null {
  const text = raw.trim();
  if (text.length === 0 || charLength(text) > CHAT_TEXT_MAX_LENGTH) return null;
  return text;
}
