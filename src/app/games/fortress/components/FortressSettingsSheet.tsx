"use client";

import { useSyncExternalStore } from "react";
import { SettingsGroupSheet, type SettingsGroup } from "@/app/components/SettingsGroupSheet";
import { SoundSettingsSection } from "@/app/games/_shared/components/SoundSettingsModal";
import { useSoundSettings } from "@/app/games/_shared/hooks/useSoundSettings";
import { DEFAULT_FORTRESS_SETTINGS, type FortressSettings, getFortressSettings, saveFortressSettings, subscribeFortressSettings } from "../lib/fortressSettings";

export function useFortressSettings(): { settings: FortressSettings; update: (partial: Partial<FortressSettings>) => FortressSettings } {
  const settings = useSyncExternalStore(subscribeFortressSettings, getFortressSettings, () => DEFAULT_FORTRESS_SETTINGS);
  return { settings, update: saveFortressSettings };
}

/**
 * 포트리스 설정 시트(D-025 보충 6) — 테트리스 설정 시트와 같은 모양(공통 SettingsGroupSheet)
 * 소리 = 게임 공통 소리 설정(효과음·배경음 분리 + 음량) · 조작 = 진동(지원하는 기기, 움직임 줄이기면 저절로 쉰다)
 */
export function FortressSettingsSheet({ onClose }: { onClose: () => void }) {
  const { settings: sound } = useSoundSettings();
  const { settings, update } = useFortressSettings();
  const groups: SettingsGroup[] = [
    {
      id: "sound",
      title: "소리",
      summary: `효과음 ${sound.sfx ? "켜짐" : "꺼짐"} · 배경음 ${sound.music ? "켜짐" : "꺼짐"}`,
      content: <SoundSettingsSection />,
    },
    {
      id: "controls",
      title: "조작",
      summary: `진동 ${settings.vibration ? "켜짐" : "꺼짐"}`,
      content: (
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-slate-300">
          <span>진동 (지원하는 기기 · 움직임 줄이기면 꺼져요)</span>
          <input type="checkbox" checked={settings.vibration} onChange={(e) => update({ vibration: e.target.checked })} className="h-5 w-5 shrink-0 accent-sky-400" data-testid="fortress-vibration" />
        </label>
      ),
    },
  ];
  return <SettingsGroupSheet title="설정" testId="fortress-settings" groups={groups} onClose={onClose} />;
}
