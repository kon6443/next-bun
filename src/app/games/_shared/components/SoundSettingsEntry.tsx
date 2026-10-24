"use client";

import { useState } from "react";
import { useSoundSettings } from "../hooks/useSoundSettings";
import { SoundSettingsModal } from "./SoundSettingsModal";

type Props = {
  /** 배경음이 없는 게임(디펜스)은 false */
  music?: boolean;
  /** 다른 대화상자 안에 둘 때 — 그 대화상자가 열린 동안 자기 키 처리를 쉬게 알린다 */
  onOpenChange?: (open: boolean) => void;
  testId?: string;
};

/** 설정 화면의 "소리 설정" 줄 (games-polish P8) — 누르면 공통 소리 모달. 지금 상태를 한 줄로 보여 준다 */
export function SoundSettingsEntry({ music = true, onOpenChange, testId }: Props) {
  const { settings } = useSoundSettings();
  const [open, setOpen] = useState(false);
  const show = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  const state = [`효과음 ${settings.sfx ? "켜짐" : "꺼짐"}`, music ? `배경음 ${settings.music ? "켜짐" : "꺼짐"}` : null].filter(Boolean).join(" · ");
  return (
    <>
      <button
        type="button"
        data-testid={testId}
        onClick={() => show(true)}
        aria-haspopup="dialog"
        className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-white/5"
      >
        <span className="flex-1">
          <span className="block text-sm font-semibold text-slate-100">소리 설정</span>
          <span className="block text-xs text-slate-400">{state} (모든 게임 공통)</span>
        </span>
        <span aria-hidden="true" className="text-slate-400">
          ›
        </span>
      </button>
      {open && <SoundSettingsModal music={music} onClose={() => show(false)} />}
    </>
  );
}
