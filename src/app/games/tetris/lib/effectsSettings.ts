/**
 * "연출 줄이기" 설정 — 저장값이 없으면 기기 설정(prefers-reduced-motion)을 따른다
 * 저장소 읽기·쓰기는 try/catch (막혀 있어도 게임은 동작). 같은 탭의 여러 화면이 바로 같은 값을 보도록 구독을 둔다
 */

export const REDUCED_EFFECTS_KEY = 'tetris:reducedEffects';

/** auto = 기기 설정을 따름 */
export type ReducedEffectsPref = 'auto' | 'on' | 'off';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const listeners = new Set<() => void>();
/** 저장소가 막힌 환경에서도 이번 방문 동안은 바꾼 값을 유지한다 */
let memoryPref: ReducedEffectsPref | null = null;
/** 마지막 저장이 실패했는지 — 실패한 값은 memoryPref에만 있으므로 비우지 않는다 */
let saveFailed = false;

export function loadReducedEffectsPref(): ReducedEffectsPref {
  try {
    const value = window.localStorage.getItem(REDUCED_EFFECTS_KEY);
    return value === 'on' || value === 'off' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveReducedEffectsPref(pref: ReducedEffectsPref): void {
  try {
    if (pref === 'auto') window.localStorage.removeItem(REDUCED_EFFECTS_KEY);
    else window.localStorage.setItem(REDUCED_EFFECTS_KEY, pref);
    saveFailed = false;
  } catch {
    // 저장하지 못해도 이번 화면에서는 바뀐 값으로 동작한다
    saveFailed = true;
  }
  memoryPref = pref;
  listeners.forEach((listener) => listener());
}

/** 렌더마다 부르므로 저장소는 처음 한 번만 읽는다 — 바꾸면 memoryPref, 다른 탭이 바꾸면 storage 이벤트로 비운다 */
export function getReducedEffectsPref(): ReducedEffectsPref {
  if (memoryPref === null) memoryPref = loadReducedEffectsPref();
  return memoryPref;
}

let motionQuery: MediaQueryList | null = null;

function getMotionQuery(): MediaQueryList | null {
  if (motionQuery) return motionQuery;
  try {
    motionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  } catch {
    motionQuery = null;
  }
  return motionQuery;
}

/** MediaQueryList.matches는 기기 설정을 따라 바뀌므로 객체만 재사용한다 */
export function prefersReducedMotion(): boolean {
  return getMotionQuery()?.matches ?? false;
}

export function resolveReducedEffects(pref: ReducedEffectsPref, systemReduced: boolean): boolean {
  return pref === 'auto' ? systemReduced : pref === 'on';
}

/** 지금 연출을 줄여야 하는지 — 설정 + 기기 설정 */
export function isReducedEffects(): boolean {
  return resolveReducedEffects(getReducedEffectsPref(), prefersReducedMotion());
}

/** useSyncExternalStore용 — 설정 변경·기기 설정 변경·다른 탭의 저장을 모두 알린다 */
export function subscribeReducedEffects(listener: () => void): () => void {
  // 구독자가 없던 동안 다른 탭이 바꿨을 수 있으니 처음 구독할 때 저장소를 다시 읽는다
  if (listeners.size === 0 && !saveFailed) memoryPref = null;
  listeners.add(listener);
  const media = getMotionQuery();
  try {
    media?.addEventListener('change', listener);
  } catch {
    // addEventListener가 없는 옛 Safari — 기기 설정 변경은 다시 들어올 때 반영된다
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key !== REDUCED_EFFECTS_KEY) return;
    memoryPref = null;
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    try {
      media?.removeEventListener('change', listener);
    } catch {
      // 위와 같음
    }
    window.removeEventListener('storage', onStorage);
  };
}
