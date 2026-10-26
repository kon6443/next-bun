"use client";

import { SettingsGroupSheet, type SettingsGroup } from "@/app/components/SettingsGroupSheet";
import { SoundSettingsSection } from "@/app/games/_shared/components/SoundSettingsModal";
import { useSoundSettings } from "@/app/games/_shared/hooks/useSoundSettings";
import type { DefenseSettings } from "../lib/settings";

/**
 * 설정 (defense DESIGN §F1 설정) — 소리·진동·데미지 숫자·화면 흔들림·기본 배속. 바꾸는 즉시 저장(lib/settings)
 * 공통 설정 시트의 그룹 목록 → 상세(D-001·D-006): 소리 · 화면(데미지 숫자·흔들림) · 플레이(진동·기본 배속)
 */
type Props = {
  open: boolean;
  settings: DefenseSettings;
  onChange: (patch: Partial<Omit<DefenseSettings, "v">>) => void;
  onClose: () => void;
};

type ToggleKey = "vibration" | "damageNumbers" | "shake";
const TOGGLE_TEXT: Record<ToggleKey, { label: string; note: string }> = {
  vibration: { label: "진동", note: "목숨을 잃을 때 (지원 기기만)" },
  damageNumbers: { label: "데미지 숫자", note: "명중할 때 피해량 표시" },
  shake: { label: "화면 흔들림", note: "보스 등장·누수 때" },
};

export function SettingsPanel({ open, settings, onChange, onClose }: Props) {
  const { settings: sound } = useSoundSettings();
  if (!open) return null;

  const onOff = (on: boolean) => (on ? "켜짐" : "꺼짐");
  const toggles = (keys: readonly ToggleKey[]) => (
    <ul className="grid gap-1">
      {keys.map((key) => (
        <li key={key}>
          <label className="flex min-h-12 items-center gap-3 rounded-xl px-2 hover:bg-white/5">
            <span className="flex-1">
              <span className="block text-sm font-semibold text-slate-100">{TOGGLE_TEXT[key].label}</span>
              <span className="block text-xs text-slate-400">{TOGGLE_TEXT[key].note}</span>
            </span>
            <input
              type="checkbox"
              data-testid={`defense-setting-${key}`}
              checked={settings[key]}
              onChange={(e) => onChange({ [key]: e.target.checked })}
              className="h-6 w-6 accent-sky-500"
            />
          </label>
        </li>
      ))}
    </ul>
  );

  const groups: SettingsGroup[] = [
    {
      id: "sound",
      title: "소리",
      summary: `효과음 ${onOff(sound.sfx)}`,
      content: (
        <section data-testid="defense-settings-sound">
          <SoundSettingsSection music={false} />
        </section>
      ),
    },
    {
      id: "display",
      title: "화면",
      summary: `데미지 숫자 ${onOff(settings.damageNumbers)} · 흔들림 ${onOff(settings.shake)}`,
      content: toggles(["damageNumbers", "shake"]),
    },
    {
      id: "play",
      title: "플레이",
      summary: `기본 배속 ${settings.defaultSpeed}× · 진동 ${onOff(settings.vibration)}`,
      content: (
        <>
          {toggles(["vibration"])}
          <fieldset className="mt-3">
            <legend className="px-2 text-sm font-semibold text-slate-100">기본 배속</legend>
            {/* 실제 라디오 — 묶음 안에서 방향키로 고른다 */}
            <div className="mt-1 grid grid-cols-3 gap-2">
              {([1, 2, 3] as const).map((speed) => (
                <label
                  key={speed}
                  className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl text-sm font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-sky-400 ${settings.defaultSpeed === speed ? "bg-sky-500/30 text-white" : "border border-white/15 text-slate-300"}`}
                >
                  <input
                    type="radio"
                    name="defense-default-speed"
                    value={speed}
                    data-testid={`defense-setting-speed-${speed}`}
                    checked={settings.defaultSpeed === speed}
                    onChange={() => onChange({ defaultSpeed: speed })}
                    className="sr-only"
                  />
                  {speed}×
                </label>
              ))}
            </div>
          </fieldset>
        </>
      ),
    },
  ];

  return <SettingsGroupSheet title="설정" testId="defense-settings" groups={groups} onClose={onClose} />;
}
