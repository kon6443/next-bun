/**
 * 소리 설정 — 효과음·배경음악은 기본 꺼짐(DESIGN §20·D-026)
 * 저장소 읽기·쓰기는 try/catch (막혀 있어도 기본값으로 동작). 같은 탭의 여러 화면이 바로 같은 값을 보도록 구독을 둔다
 */

export const SOUND_SETTINGS_KEY = 'tetris:sound';

export type SoundSettings = { sfx: boolean; music: boolean; volume: number };

export const DEFAULT_SOUND_SETTINGS: Readonly<SoundSettings> = Object.freeze({ sfx: false, music: false, volume: 0.6 });

const listeners = new Set<() => void>();
/** useSyncExternalStore 스냅샷 — 값이 바뀔 때만 새 객체로 바꾼다 */
let current: SoundSettings | null = null;
/** 마지막 저장이 실패했는지 — 실패한 값은 current에만 있으므로 비우지 않는다 */
let saveFailed = false;

/** 저장값을 믿지 않는다 — 모르는 값은 기본값, 볼륨은 0~1로 자른다 */
export function normalizeSoundSettings(raw: unknown): SoundSettings {
  const value = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const volume =
    typeof value.volume === 'number' && Number.isFinite(value.volume)
      ? Math.min(1, Math.max(0, value.volume))
      : DEFAULT_SOUND_SETTINGS.volume;
  return {
    sfx: typeof value.sfx === 'boolean' ? value.sfx : DEFAULT_SOUND_SETTINGS.sfx,
    music: typeof value.music === 'boolean' ? value.music : DEFAULT_SOUND_SETTINGS.music,
    volume,
  };
}

/** 저장소에서 읽는다 — 없거나 깨졌거나 막혀 있으면 기본값 */
export function loadSoundSettings(): SoundSettings {
  try {
    const raw = window.localStorage.getItem(SOUND_SETTINGS_KEY);
    if (raw === null) return { ...DEFAULT_SOUND_SETTINGS };
    return normalizeSoundSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SOUND_SETTINGS };
  }
}

/** 렌더마다 부르므로 저장소는 처음 한 번만 읽는다 — 바꾸면 current, 다른 탭이 바꾸면 storage 이벤트로 비운다 */
export function getSoundSettings(): SoundSettings {
  if (current === null) current = loadSoundSettings();
  return current;
}

/** 일부만 바꿔 저장하고 구독자에게 알린다 — 저장이 막혀도 이번 방문 동안은 바뀐 값으로 동작한다 */
export function saveSoundSettings(partial: Partial<SoundSettings>): SoundSettings {
  const next = normalizeSoundSettings({ ...getSoundSettings(), ...partial });
  try {
    window.localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(next));
    saveFailed = false;
  } catch {
    saveFailed = true;
  }
  current = next;
  listeners.forEach((listener) => listener());
  return next;
}

/** useSyncExternalStore용 — 설정 변경과 다른 탭의 저장을 알린다 */
export function subscribeSoundSettings(listener: () => void): () => void {
  // 구독자가 없던 동안 다른 탭이 바꿨을 수 있으니 처음 구독할 때 저장소를 다시 읽는다
  if (listeners.size === 0 && !saveFailed) current = null;
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== SOUND_SETTINGS_KEY && e.key !== null) return;
    current = null;
    listener();
  };
  const hasWindow = typeof window !== 'undefined';
  if (hasWindow) window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (hasWindow) window.removeEventListener('storage', onStorage);
  };
}

/** 테스트 전용 — 모듈 상태를 처음으로 되돌린다 */
export function __resetSoundSettingsForTests(): void {
  listeners.clear();
  current = null;
  saveFailed = false;
}
