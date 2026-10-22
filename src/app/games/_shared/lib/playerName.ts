/**
 * 랭킹 등록 이름 — 백엔드 규칙(DESIGN §3)과 같은 기준으로 미리 확인한다
 * 금칙어는 서버만 판정한다(GAME_PLAYER_NAME_FORBIDDEN)
 */

export const PLAYER_NAME_MAX_LENGTH = 12;
export const PLAYER_NAME_MAX_BYTES = 48;

/** 백엔드와 같은 허용 문자 — 완성형 한글만(자모 단독 불가) */
const ALLOWED = /^[가-힣A-Za-z0-9 _-]+$/;

/** 앞뒤 공백 제거 + 연속 공백 1개로 */
export function normalizePlayerName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function playerNameLength(name: string): number {
  return Array.from(name).length;
}

/** 문제가 없으면 null, 있으면 한국어 안내 */
export function validatePlayerName(raw: string): string | null {
  const name = normalizePlayerName(raw);
  if (name.length === 0) return '이름을 입력해주세요.';
  if (playerNameLength(name) > PLAYER_NAME_MAX_LENGTH) return `이름은 ${PLAYER_NAME_MAX_LENGTH}자까지예요.`;
  if (!ALLOWED.test(name)) return '완성된 한글·영문·숫자·공백·_·-만 쓸 수 있어요.';
  if (new TextEncoder().encode(name).length > PLAYER_NAME_MAX_BYTES) return '이름이 너무 길어요.';
  return null;
}
