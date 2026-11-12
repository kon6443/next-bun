/**
 * 로비 채팅에서 숨긴 사람(senderKey) — 이 브라우저에만 저장한다(서버 차단이 아니다, tetris-chat)
 * senderKey는 같은 사람이면 같은 값이라 재접속 뒤에도 숨김이 이어진다. 상한을 넘으면 오래된 것부터 뺀다
 * 저장소를 못 쓰면(사생활 보호 모드 등) 이번 화면에서만 숨긴다. 게임마다 키가 다르다(채널이 다르다)
 */

const LIMIT = 200;

export type HiddenSendersStore = { load: () => string[]; save: (keys: readonly string[]) => void };

export function createHiddenSendersStore(key: string): HiddenSendersStore {
  return {
    load() {
      try {
        const raw = window.localStorage.getItem(key);
        const list: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string').slice(-LIMIT) : [];
      } catch {
        return [];
      }
    },
    save(keys) {
      try {
        window.localStorage.setItem(key, JSON.stringify(keys.slice(-LIMIT)));
      } catch {
        // 저장 실패 — 이번 화면에서만 숨긴다
      }
    },
  };
}
