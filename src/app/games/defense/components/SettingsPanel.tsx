"use client";

import { useId } from "react";
import { useDialog } from "@/app/hooks/useDialog";
import type { DefenseSettings } from "../lib/settings";

/**
 * 설정 (defense DESIGN §F1 설정) — 효과음·진동·데미지 숫자·화면 흔들림·기본 배속. 바꾸는 즉시 저장(lib/settings)
 * 효과음은 플레이 HUD 음소거 토글과 같은 값
 */
type Props = {
  open: boolean;
  settings: DefenseSettings;
  onChange: (patch: Partial<Omit<DefenseSettings, "v">>) => void;
  onClose: () => void;
};

const TOGGLES: readonly { key: "sound" | "vibration" | "damageNumbers" | "shake"; label: string; note: string }[] = [
  { key: "sound", label: "효과음", note: "기본은 꺼져 있어요" },
  { key: "vibration", label: "진동", note: "목숨을 잃을 때 (지원 기기만)" },
  { key: "damageNumbers", label: "데미지 숫자", note: "명중할 때 피해량 표시" },
  { key: "shake", label: "화면 흔들림", note: "보스 등장·누수 때" },
];

export function SettingsPanel({ open, settings, onChange, onClose }: Props) {
  const titleId = useId();
  const dialogRef = useDialog<HTMLDivElement>(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="defense-settings"
        className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900 p-5 focus:outline-none"
      >
        <h2 id={titleId} className="text-lg font-bold text-white">
          설정
        </h2>
        <ul className="mt-3 grid gap-1">
          {TOGGLES.map((t) => (
            <li key={t.key}>
              <label className="flex min-h-12 items-center gap-3 rounded-xl px-2 hover:bg-white/5">
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-slate-100">{t.label}</span>
                  <span className="block text-xs text-slate-400">{t.note}</span>
                </span>
                <input
                  type="checkbox"
                  data-testid={`defense-setting-${t.key}`}
                  checked={settings[t.key]}
                  onChange={(e) => onChange({ [t.key]: e.target.checked })}
                  className="h-6 w-6 accent-sky-500"
                />
              </label>
            </li>
          ))}
        </ul>
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
        <button
          type="button"
          onClick={onClose}
          data-testid="defense-settings-close"
          className="mt-4 min-h-11 w-full rounded-full border border-white/20 text-sm font-semibold text-slate-100"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
