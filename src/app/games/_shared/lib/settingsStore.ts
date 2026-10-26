/**
 * localStorage 설정 구독 스토어(D-001) — 한 키의 설정을 화면 여러 곳(홈·플레이·공통 설정 시트)이 같은 값으로 본다
 * useSyncExternalStore와 쓴다: get은 같은 값이면 같은 객체(렌더마다 부른다), save는 같은 호출 안에서 구독자에게 알린다,
 * 다른 탭의 저장은 storage 이벤트로 받는다. 저장이 막혀도(사생활 모드·용량) 이번 방문 동안은 바뀐 값으로 동작한다
 * 키·저장 형식은 기존 그대로(마이그레이션 없음) — 정규화(normalize)가 깨진 값·범위 밖 값을 기본값으로 바로잡는다
 */

export type LocalSettingsStore<T> = {
  get: () => T;
  /** 화면 진입 때 한 번 읽기(구독 없이) — 구독자가 없으면 저장소를 다시 읽는다(다른 탭·이전 방문의 변경 반영) */
  load: () => T;
  /** 서버 렌더·hydration 첫 렌더 값 — 기본값 */
  getServerSnapshot: () => T;
  save: (partial: Partial<T>) => T;
  subscribe: (listener: () => void) => () => void;
};

export function createLocalSettingsStore<T extends object>(options: {
  key: string;
  defaults: Readonly<T>;
  /** 저장소 값(깨졌을 수 있음) → 설정. null이면 저장된 값이 없다 */
  normalize: (raw: unknown) => T;
}): LocalSettingsStore<T> {
  const { key, defaults, normalize } = options;
  const listeners = new Set<() => void>();
  let current: T | null = null;
  /** 마지막 저장이 막혔다 — 저장소를 다시 읽으면 바꾼 값을 잃으니 메모리 값을 지킨다 */
  let saveFailed = false;
  const serverSnapshot = Object.freeze({ ...defaults }) as T;

  const load = (): T => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return { ...defaults };
      return normalize(JSON.parse(raw));
    } catch {
      return { ...defaults };
    }
  };

  const get = (): T => {
    if (current === null) current = load();
    return current;
  };

  const loadFresh = (): T => {
    if (listeners.size === 0 && !saveFailed) current = null;
    return get();
  };

  const save = (partial: Partial<T>): T => {
    const next = normalize({ ...get(), ...partial });
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
      saveFailed = false;
    } catch {
      saveFailed = true;
    }
    current = next;
    listeners.forEach((listener) => listener());
    return next;
  };

  const subscribe = (listener: () => void): (() => void) => {
    // 구독자가 없던 동안 다른 탭이 바꿨을 수 있으니 처음 구독할 때 다시 읽는다
    if (listeners.size === 0 && !saveFailed) current = null;
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key && e.key !== null) return;
      current = null;
      listener();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  };

  return { get, load: loadFresh, getServerSnapshot: () => serverSnapshot, save, subscribe };
}
