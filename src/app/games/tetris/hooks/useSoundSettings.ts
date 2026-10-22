"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_SOUND_SETTINGS,
  getSoundSettings,
  saveSoundSettings,
  subscribeSoundSettings,
  type SoundSettings,
} from "../lib/sound/soundSettings";

/** 서버 렌더에서는 기본값(모두 꺼짐)으로 그린다 */
const getServerSnapshot = (): SoundSettings => DEFAULT_SOUND_SETTINGS;

/** 소리 설정 — 같은 탭의 다른 화면이나 다른 탭이 바꿔도 바로 다시 그린다 */
export function useSoundSettings(): { settings: SoundSettings; update: (partial: Partial<SoundSettings>) => void } {
  const settings = useSyncExternalStore(subscribeSoundSettings, getSoundSettings, getServerSnapshot);
  return { settings, update: saveSoundSettings };
}
