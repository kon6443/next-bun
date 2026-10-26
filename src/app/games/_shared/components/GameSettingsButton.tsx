"use client";

import { type ReactNode, useState } from "react";
import { useSoundSettings } from "../hooks/useSoundSettings";
import { unlockSounds } from "../lib/soundUnlock";

type Props = {
  /** 시트 — 게임이 섹션을 채운 설정 시트(공통 SettingsSheet). close로 닫는다 */
  renderSheet: (close: () => void) => ReactNode;
  /** 시트가 열리고 닫힐 때 — 게임은 열릴 때 일시정지한다 */
  onOpenChange?: (open: boolean) => void;
  testId?: string;
  /** 톱니 대신 버튼 안에 넣을 내용(일시정지 메뉴의 "설정"·홈의 설정 줄) — 이때 모양은 className이 정한다 */
  children?: ReactNode;
  className?: string;
  /** square = 테트리스 머리줄 버튼, round = 디펜스 HUD 알약 버튼 */
  shape?: "square" | "round";
  /** 배경음이 없는 게임은 false — 소리 켜짐 표시도 효과음만 본다 */
  music?: boolean;
};

const SHAPES = {
  square: "h-11 w-11 rounded-xl border border-slate-700/60 bg-slate-900/70",
  round: "min-h-11 min-w-[clamp(2.5rem,11.3vw,2.75rem)] rounded-full border border-white/15",
} as const;

/**
 * 게임 설정 버튼(D-001) — 헤더·일시정지 메뉴 어디서든 같은 설정 시트를 연다. 시트 내용(섹션)은 게임이 정한다
 * 키보드로 연 시트가 닫히면 포커스는 이 버튼으로 돌아온다(useDialog)
 * 톱니는 머리줄 소리 버튼 자리를 대신하므로 소리 상태를 잃지 않게 — 꺼져 있으면 모서리에 음소거 배지, 이름에도 상태
 */
export function GameSettingsButton({ renderSheet, onOpenChange, testId, children, className = "", shape = "square", music = true }: Props) {
  const { settings: sound } = useSoundSettings();
  const soundOn = sound.sfx || (music && sound.music);
  const [open, setOpen] = useState(false);
  const show = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // 마우스로 누른 뒤 포커스가 남으면 게임의 Space가 이 버튼을 다시 누른다 — 포커스를 놓는다
          // (그래서 마우스로 연 시트는 닫혀도 포커스를 돌려줄 곳이 없다. 키보드로 열면(detail 0) 놓지 않아 useDialog가 이 버튼으로 돌려준다)
          if (e.detail > 0) e.currentTarget.blur();
          // 이미 켜 둔 소리는 이 클릭(제스처)에서 깨운다 — 소리 버튼과 같게
          if (soundOn) unlockSounds();
          show(true);
        }}
        aria-label={children ? undefined : `설정 (소리 ${soundOn ? "켜짐" : "꺼짐"})`}
        data-sound={children ? undefined : soundOn ? "on" : "off"}
        aria-haspopup="dialog"
        data-testid={testId}
        className={children ? className : `relative flex items-center justify-center text-slate-300 hover:text-slate-100 ${SHAPES[shape]} ${className}`}
      >
        {children ?? (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        )}
        {!children && !soundOn && (
          <span
            aria-hidden="true"
            data-testid="settings-sound-off"
            className="absolute -right-1 top-0 flex h-4 w-4 items-center justify-center rounded-full border border-slate-900 bg-slate-600 text-slate-100"
          >
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 9h4l5-4v14l-5-4H4z" />
              <path d="M17 9l5 6M22 9l-5 6" />
            </svg>
          </span>
        )}
      </button>
      {open && renderSheet(() => show(false))}
    </>
  );
}
