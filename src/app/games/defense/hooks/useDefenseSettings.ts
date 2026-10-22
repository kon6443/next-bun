"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, type DefenseSettings, SETTINGS_EVENT, loadSettings, updateSettings } from "../lib/settings";

/**
 * 설정 상태 — 서버 렌더·첫 렌더는 기본값, 마운트 뒤 저장본. 같은 탭의 다른 곳(HUD 토글·설정 패널)이 바꾸면 따라 바뀐다
 */
export function useDefenseSettings() {
  const [settings, setSettings] = useState<DefenseSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const sync = () => setSettings(loadSettings());
    sync();
    setLoaded(true);
    window.addEventListener(SETTINGS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const update = useCallback((patch: Partial<Omit<DefenseSettings, "v">>) => setSettings(updateSettings(patch)), []);
  return { settings, loaded, update };
}
