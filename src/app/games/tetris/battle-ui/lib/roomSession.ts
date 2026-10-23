/**
 * 재연결 정보 — 방 코드별 playerToken(방 수명 동안 유효한 비밀값)을 이 브라우저에 보관한다(localStorage, D-003)
 * 새로고침·새 탭·초대 링크·소켓 재연결 때 같은 자리로 돌아가는 데 쓴다
 * - tabId = 마지막으로 그 자리에 들어간 탭 — 끊겼다 다시 붙은 탭이 그사이 다른 탭이 넘겨받은 자리를 조용히 되찾지 않게
 * - 탭끼리 같은 키를 쓰므로 지울 때는 그 탭이 쓰던 토큰일 때만 지운다(compare-and-delete) — 다른 탭이 쓰는 값을 지우지 않게
 * - 하루가 지나면 버린다(방은 그보다 먼저 사라진다). 저장할 때 오래된 키도 함께 정리한다
 * - 저장소에 쓰지 못하면 이 탭 메모리에만 둔다(새로고침하면 사라진다)
 */

const PREFIX = 'tetris:battle:';
const keyOf = (code: string) => `${PREFIX}${code}`;

export const ROOM_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type RoomSession = { playerId: string; playerToken: string; playerName: string; tabId?: string };
type StoredRoomSession = RoomSession & { savedAt: number };

/** 저장소에 쓰지 못한 값 — 저장소 값과 둘 다 있으면 나중에 저장한 쪽을 쓴다 */
const memory = new Map<string, StoredRoomSession>();

function parse(raw: string | null): StoredRoomSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredRoomSession>;
    if (typeof value.playerId !== 'string' || typeof value.playerToken !== 'string' || typeof value.playerName !== 'string') return null;
    return {
      playerId: value.playerId,
      playerToken: value.playerToken,
      playerName: value.playerName,
      ...(typeof value.tabId === 'string' ? { tabId: value.tabId } : {}),
      // 형식이 맞지 않으면 0 — 곧바로 만료된다
      savedAt: typeof value.savedAt === 'number' ? value.savedAt : 0,
    };
  } catch {
    return null;
  }
}

const expired = (value: StoredRoomSession, now: number) => now - value.savedAt > ROOM_SESSION_TTL_MS;

let legacyDrained = false;

/**
 * 이전 배포는 탭마다 sessionStorage에 뒀다 — 이 탭에서 처음 읽을 때 한 번만 옮기고 모두 지운다(진행 중인 방에서 새로고침해도 자리 유지)
 * 이미 localStorage에 그 방 값이 있으면(다른 탭이 먼저 옮김) 옮기지 않는다. 한 번뿐이라 다른 탭이 지운 값을 나중에 되살리지 않는다
 */
function drainLegacyOnce(now: number): void {
  if (legacyDrained) return;
  legacyDrained = true;
  try {
    const legacy = window.sessionStorage;
    const keys: string[] = [];
    for (let i = 0; i < legacy.length; i++) {
      const key = legacy.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const value = parse(legacy.getItem(key));
      legacy.removeItem(key);
      const code = key.slice(PREFIX.length);
      // 저장소를 못 읽으면(undefined) saveRoomSession이 이 탭 메모리에 둔다
      if (value && !readStored(code)) saveRoomSession(code, value, now);
    }
  } catch {
    // 무시
  }
}

/** 저장소를 못 읽으면 undefined */
function readStored(code: string): StoredRoomSession | null | undefined {
  try {
    return parse(window.localStorage.getItem(keyOf(code)));
  } catch {
    return undefined;
  }
}

export function loadRoomSession(code: string, now = Date.now()): RoomSession | null {
  drainLegacyOnce(now);
  const stored = readStored(code) ?? null;
  const inMemory = memory.get(code) ?? null;
  const value = stored && inMemory ? (inMemory.savedAt > stored.savedAt ? inMemory : stored) : (stored ?? inMemory);
  if (!value) return null;
  if (expired(value, now)) {
    clearRoomSession(code, value.playerToken);
    return null;
  }
  return {
    playerId: value.playerId,
    playerToken: value.playerToken,
    playerName: value.playerName,
    ...(value.tabId !== undefined ? { tabId: value.tabId } : {}),
  };
}

export function saveRoomSession(code: string, session: RoomSession, now = Date.now()): void {
  const value: StoredRoomSession = { ...session, savedAt: now };
  try {
    pruneExpired(now);
    window.localStorage.setItem(keyOf(code), JSON.stringify(value));
    memory.delete(code);
  } catch {
    // 저장하지 못하면 이 탭 메모리의 값을 쓴다
    memory.set(code, value);
  }
}

/** 이 토큰으로 저장된 경우에만 지운다 — 그사이 다른 탭이 같은 방에 다시 들어가 새 토큰을 저장했으면 그대로 둔다 */
export function clearRoomSession(code: string, playerToken: string): void {
  if (memory.get(code)?.playerToken === playerToken) memory.delete(code);
  if (readStored(code)?.playerToken !== playerToken) return;
  try {
    window.localStorage.removeItem(keyOf(code));
  } catch {
    // 무시
  }
}

function pruneExpired(now: number): void {
  const storage = window.localStorage;
  const stale: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    const value = parse(storage.getItem(key));
    if (!value || expired(value, now)) stale.push(key);
  }
  for (const key of stale) storage.removeItem(key);
}

/** 테스트 전용 — 모듈 상태(이전 값 옮김 여부·메모리 값)를 처음으로 */
export function resetRoomSessionForTest(): void {
  legacyDrained = false;
  memory.clear();
}
