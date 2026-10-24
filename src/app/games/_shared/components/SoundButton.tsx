"use client";

import { useState } from "react";
import { useSoundSettings } from "../hooks/useSoundSettings";
import { unlockSounds } from "../lib/soundUnlock";
import { SoundSettingsModal } from "./SoundSettingsModal";

type Props = {
  className?: string;
  /** 배경음이 없는 게임은 false — 켜짐 표시도 효과음만 본다 */
  music?: boolean;
  /** 모달이 열리고 닫힐 때 — 게임은 열릴 때 일시정지한다 */
  onOpenChange?: (open: boolean) => void;
  testId?: string;
  /** square = 테트리스 머리줄 버튼, round = 디펜스 HUD 알약 버튼(좁은 폭에서 vw로 줄어든다) */
  shape?: "square" | "round";
};

/**
 * 게임·다시보기 화면의 소리 버튼 (games-polish P8) — 누르면 공통 소리 설정 모달을 연다
 * 음소거 토글 대신 모달 하나로 통일 — 효과음·배경음·음량을 같은 곳에서, 좁은 HUD에 작은 버튼 두 개를 두지 않게
 * 이미 켜 둔 소리는 이 클릭(제스처)에서 깨운다
 */
const SHAPES = {
  square: "h-11 w-11 rounded-xl border-slate-700/60 bg-slate-900/70",
  round: "min-h-11 min-w-[clamp(2.5rem,11.3vw,2.75rem)] rounded-full border-white/15",
} as const;

export function SoundButton({ className = "", music = true, onOpenChange, testId, shape = "square" }: Props) {
  const { settings } = useSoundSettings();
  const [open, setOpen] = useState(false);
  const on = settings.sfx || (music && settings.music);

  const show = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // 마우스로 누른 뒤 포커스가 남으면 게임의 Space가 이 버튼을 다시 누른다 — 포커스를 놓는다(모달이 닫히면 useDialog가 돌려준다)
          if (e.detail > 0) e.currentTarget.blur();
          if (on) unlockSounds();
          show(true);
        }}
        aria-label={`소리 설정 (${on ? "켜짐" : "꺼짐"})`}
        aria-haspopup="dialog"
        data-testid={testId}
        data-value={on ? "on" : "off"}
        className={`flex items-center justify-center border text-slate-300 transition-colors ${SHAPES[shape]} ${
          on ? "border-cyan-400/60 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.35)]" : ""
        } ${className}`}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 9h4l5-4v14l-5-4H4z" />
          {on ? (
            <>
              <path d="M16.5 8.5a5 5 0 0 1 0 7" />
              <path d="M19 6a8.5 8.5 0 0 1 0 12" />
            </>
          ) : (
            <path d="M17 9l5 6M22 9l-5 6" />
          )}
        </svg>
      </button>
      {open && <SoundSettingsModal music={music} onClose={() => show(false)} />}
    </>
  );
}
