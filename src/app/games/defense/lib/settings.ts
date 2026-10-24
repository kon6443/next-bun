import { readStorageJson, writeStorage } from '@/app/games/_shared/lib/storage';

/**
 * 디펜스 설정 (§F1 설정·§F10 저장 `defense:settings`, `{ v }` 스키마) — 진동·데미지 숫자·화면 흔들림·기본 배속
 * 소리는 게임 공통 소리 설정(_shared/lib/soundSettings)으로 옮겼다(P8 — 예전 `sound` 값은 거기서 한 번 옮긴다). 읽기·쓰기 실패는 기본값으로 동작
 */

const KEY = 'defense:settings';
const VERSION = 1;

export type DefenseSettings = {
  v: number;
  vibration: boolean;
  damageNumbers: boolean;
  shake: boolean;
  defaultSpeed: 1 | 2 | 3;
};

export const DEFAULT_SETTINGS: DefenseSettings = { v: VERSION, vibration: true, damageNumbers: true, shake: true, defaultSpeed: 1 };

/** 저장본 — 모르는 값·다른 버전은 기본값으로 메운다(필드 하나가 깨져도 나머지는 살린다) */
export function loadSettings(): DefenseSettings {
  const raw = readStorageJson<Partial<DefenseSettings>>('local', KEY);
  if (!raw || raw.v !== VERSION) return DEFAULT_SETTINGS;
  const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
  return {
    v: VERSION,
    vibration: bool(raw.vibration, DEFAULT_SETTINGS.vibration),
    damageNumbers: bool(raw.damageNumbers, DEFAULT_SETTINGS.damageNumbers),
    shake: bool(raw.shake, DEFAULT_SETTINGS.shake),
    defaultSpeed: raw.defaultSpeed === 2 || raw.defaultSpeed === 3 ? raw.defaultSpeed : 1,
  };
}

export function saveSettings(settings: DefenseSettings): boolean {
  return writeStorage('local', KEY, JSON.stringify(settings));
}

/** 같은 탭의 다른 화면(HUD 토글·설정 패널)에 바뀐 값을 알린다 — storage 이벤트는 다른 탭에만 온다 */
export const SETTINGS_EVENT = 'defense:settings';

export function updateSettings(patch: Partial<Omit<DefenseSettings, 'v'>>): DefenseSettings {
  const next = { ...loadSettings(), ...patch, v: VERSION };
  saveSettings(next);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SETTINGS_EVENT));
  return next;
}
