/**
 * 포트리스 게임 설정(D-025 보충 6) — 지금은 진동 하나. 소리는 게임 공통 설정(_shared/lib/soundSettings)
 * 키 fortress:settings · 저장값이 없거나 깨졌으면 기본(진동 켜짐, 테트리스와 같다). 저장소가 막혀도 이번 방문 동안은 바꾼 값으로
 */
import { createLocalSettingsStore } from "@/app/games/_shared/lib/settingsStore";
import { prefersReducedMotion } from "@/app/games/_shared/lib/motion";
import { vibrate } from "@/app/games/_shared/lib/vibrate";

export const FORTRESS_SETTINGS_KEY = "fortress:settings";
export type FortressSettings = { vibration: boolean };
export const DEFAULT_FORTRESS_SETTINGS: Readonly<FortressSettings> = Object.freeze({ vibration: true });

function normalizeFortressSettings(raw: unknown): FortressSettings {
  const v = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { vibration: typeof v.vibration === "boolean" ? v.vibration : DEFAULT_FORTRESS_SETTINGS.vibration };
}

const createStore = () => createLocalSettingsStore<FortressSettings>({ key: FORTRESS_SETTINGS_KEY, defaults: DEFAULT_FORTRESS_SETTINGS, normalize: normalizeFortressSettings });
/** 공용 설정 스토어(_shared/lib/settingsStore) — 구독·다른 탭 반영·저장 실패 시 메모리 값 유지 */
let store = createStore();

export function getFortressSettings(): FortressSettings {
  return store.get();
}

export function saveFortressSettings(partial: Partial<FortressSettings>): FortressSettings {
  return store.save(partial);
}

export function subscribeFortressSettings(listener: () => void): () => void {
  return store.subscribe(listener);
}

/** 진동 — 설정이 켜져 있고 움직임 줄이기가 아닐 때만(지원하지 않는 기기는 공용 vibrate가 무시) */
export function fortressVibrate(pattern: number | number[]): boolean {
  if (!getFortressSettings().vibration || prefersReducedMotion()) return false;
  vibrate(pattern);
  return true;
}

/** 테스트 전용 */
export function __resetFortressSettingsForTests(): void {
  store = createStore();
}
