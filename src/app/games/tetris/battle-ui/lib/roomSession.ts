/**
 * 재연결 정보 — 방 코드별 playerToken(방 수명 동안 유효한 비밀값)을 이 탭에만 보관한다(sessionStorage)
 * 새로고침·소켓 재연결 때 같은 playerId로 돌아가는 데 쓴다. 저장소가 막혀 있으면 재연결만 안 된다
 */

const keyOf = (code: string) => `tetris:battle:${code}`;

export type RoomSession = { playerId: string; playerToken: string; playerName: string };

export function loadRoomSession(code: string): RoomSession | null {
  try {
    const raw = window.sessionStorage.getItem(keyOf(code));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<RoomSession>;
    if (typeof value.playerId !== 'string' || typeof value.playerToken !== 'string' || typeof value.playerName !== 'string') return null;
    return { playerId: value.playerId, playerToken: value.playerToken, playerName: value.playerName };
  } catch {
    return null;
  }
}

export function saveRoomSession(code: string, session: RoomSession): void {
  try {
    window.sessionStorage.setItem(keyOf(code), JSON.stringify(session));
  } catch {
    // 저장하지 못하면 재연결만 안 된다
  }
}

export function clearRoomSession(code: string): void {
  try {
    window.sessionStorage.removeItem(keyOf(code));
  } catch {
    // 무시
  }
}
