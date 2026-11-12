/**
 * 포트리스 게임 설정(D-025 보충 6) — 지금은 진동 하나. 소리는 게임 공통 설정(_shared/lib/soundSettings)
 * 키 fortress:settings · 저장값이 없거나 깨졌으면 기본(진동 켜짐, 테트리스와 같다). 저장소가 막혀도 이번 방문 동안은 바꾼 값으로
 */
import { vibrate } from "@/app/games/_shared/lib/vibrate";

export const FORTRESS_SETTINGS_KEY = "fortress:settings";
export type FortressSettings = { vibration: boolean };
export const DEFAULT_FORTRESS_SETTINGS: Readonly<FortressSettings> = Object.freeze({ vibration: true });

const listeners = new Set<() => void>();
let current: FortressSettings | null = null;

export function normalizeFortressSettings(raw: unknown): FortressSettings {
  const v = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { vibration: typeof v.vibration === "boolean" ? v.vibration : DEFAULT_FORTRESS_SETTINGS.vibration };
}

export function getFortressSettings(): FortressSettings {
  if (current) return current;
  try {
    const raw = window.localStorage.getItem(FORTRESS_SETTINGS_KEY);
    current = raw === null ? { ...DEFAULT_FORTRESS_SETTINGS } : normalizeFortressSettings(JSON.parse(raw));
  } catch {
    current = { ...DEFAULT_FORTRESS_SETTINGS };
  }
  return current;
}

export function saveFortressSettings(partial: Partial<FortressSettings>): FortressSettings {
  const next = normalizeFortressSettings({ ...getFortressSettings(), ...partial });
  try {
    window.localStorage.setItem(FORTRESS_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // 저장이 막혀도 이번 방문은 바뀐 값으로
  }
  current = next;
  listeners.forEach((l) => l());
  return next;
}

export function subscribeFortressSettings(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== FORTRESS_SETTINGS_KEY && e.key !== null) return;
    current = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** 진동 — 설정이 켜져 있고 움직임 줄이기가 아닐 때만(지원하지 않는 기기는 공용 vibrate가 무시) */
export function fortressVibrate(pattern: number | number[]): boolean {
  if (!getFortressSettings().vibration || prefersReducedMotion()) return false;
  vibrate(pattern);
  return true;
}

/** 테스트 전용 */
export function __resetFortressSettingsForTests(): void {
  listeners.clear();
  current = null;
}
