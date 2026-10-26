"use client";

import { useSyncExternalStore } from "react";
import { type TetrisSettings, tetrisSettingsStore } from "../lib/storage";

/** 테트리스 조작 설정(DAS·ARR·진동) — 홈·플레이·설정 시트 어디서 바꿔도 같은 탭·다른 탭에 바로 반영된다. 서버 렌더는 기본값 */
export function useTetrisSettings(): { settings: TetrisSettings; update: (partial: Partial<TetrisSettings>) => TetrisSettings } {
  const settings = useSyncExternalStore(tetrisSettingsStore.subscribe, tetrisSettingsStore.get, tetrisSettingsStore.getServerSnapshot);
  return { settings, update: tetrisSettingsStore.save };
}
