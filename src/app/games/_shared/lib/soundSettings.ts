/**
 * 게임 공통 소리 설정 (games-polish P8) — 효과음·배경음 켜기/끄기와 각자의 음량. 테트리스·디펜스가 같은 값을 쓴다
 * - 저장값이 없으면 모두 꺼짐(사용자 결정 — 기본 OFF). 바꾸면 구독한 플레이어가 바로 반영한다
 * - 저장소 읽기·쓰기는 try/catch(막혀 있어도 기본값으로 동작). 같은 탭은 구독, 다른 탭은 storage 이벤트로 맞춘다
 * - 예전 게임별 저장값(tetris:sound · defense:settings.sound)은 공통 키가 없을 때 한 번 옮긴다 — 사용자가 직접 켠 것만 켜진다
 */

export const SOUND_SETTINGS_KEY = 'games:sound';
/** 옮겨 올 예전 저장값 — 지우지 않는다(옛 화면이 남은 탭이 읽어도 깨지지 않게) */
export const LEGACY_TETRIS_SOUND_KEY = 'tetris:sound';
export const LEGACY_DEFENSE_SETTINGS_KEY = 'defense:settings';

export type SoundSettings = { sfx: boolean; sfxVolume: number; music: boolean; musicVolume: number };

export const DEFAULT_SOUND_SETTINGS: Readonly<SoundSettings> = Object.freeze({ sfx: false, sfxVolume: 0.6, music: false, musicVolume: 0.6 });

const listeners = new Set<() => void>();
/** useSyncExternalStore 스냅샷 — 값이 바뀔 때만 새 객체로 바꾼다 */
let current: SoundSettings | null = null;
/** 마지막 저장이 실패했는지 — 실패한 값은 current에만 있으므로 비우지 않는다 */
let saveFailed = false;

const volumeOf = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback);

/** 저장값을 믿지 않는다 — 모르는 값은 기본값, 음량은 0~1로 자른다 */
export function normalizeSoundSettings(raw: unknown): SoundSettings {
  const value = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    sfx: typeof value.sfx === 'boolean' ? value.sfx : DEFAULT_SOUND_SETTINGS.sfx,
    sfxVolume: volumeOf(value.sfxVolume, DEFAULT_SOUND_SETTINGS.sfxVolume),
    music: typeof value.music === 'boolean' ? value.music : DEFAULT_SOUND_SETTINGS.music,
    musicVolume: volumeOf(value.musicVolume, DEFAULT_SOUND_SETTINGS.musicVolume),
  };
}

function readJson(key: string): Record<string, unknown> | null {
  const raw = window.localStorage.getItem(key);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * 예전 게임별 저장값 → 공통 설정. 직접 켠 값(true)만 켜고 나머지는 기본(꺼짐)
 * 테트리스 {sfx, music, volume} — 음량 하나를 둘에 · 디펜스 {sound} — 효과음
 */
function migrateLegacy(): SoundSettings | null {
  const tetris = readJson(LEGACY_TETRIS_SOUND_KEY);
  const defense = readJson(LEGACY_DEFENSE_SETTINGS_KEY);
  if (!tetris && defense?.sound === undefined) return null;
  const volume = volumeOf(tetris?.volume, DEFAULT_SOUND_SETTINGS.sfxVolume);
  return {
    sfx: tetris?.sfx === true || defense?.sound === true,
    sfxVolume: volume,
    music: tetris?.music === true,
    musicVolume: volume,
  };
}

/** 저장소에서 읽는다 — 없으면 예전 저장값을 한 번 옮기고, 그것도 없거나 깨졌거나 막혀 있으면 기본값 */
export function loadSoundSettings(): SoundSettings {
  try {
    const raw = window.localStorage.getItem(SOUND_SETTINGS_KEY);
    if (raw !== null) return normalizeSoundSettings(JSON.parse(raw));
    const migrated = migrateLegacy();
    if (!migrated) return { ...DEFAULT_SOUND_SETTINGS };
    try {
      window.localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(migrated));
    } catch {
      // 쓰기만 막혔으면(용량 초과 등) 옮긴 값으로 동작한다 — 다음 방문에 다시 옮긴다
    }
    return migrated;
  } catch {
    return { ...DEFAULT_SOUND_SETTINGS };
  }
}

/** 렌더마다 부르므로 저장소는 처음 한 번만 읽는다 — 바꾸면 current, 다른 탭이 바꾸면 storage 이벤트로 비운다 */
export function getSoundSettings(): SoundSettings {
  if (current === null) current = loadSoundSettings();
  return current;
}

/** 소리가 하나라도 켜져 있나 — 소리 버튼 표시 */
export function isAnySoundOn(settings: SoundSettings): boolean {
  return settings.sfx || settings.music;
}

/** 일부만 바꿔 저장하고 구독자에게 바로(같은 호출 안에서) 알린다 — 저장이 막혀도 이번 방문 동안은 바뀐 값으로 동작한다 */
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
