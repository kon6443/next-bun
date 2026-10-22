"use client";

import { useSoundSettings } from "../hooks/useSoundSettings";
import { getSoundPlayer } from "../lib/sound/soundPlayer";

/**
 * 게임·대전 화면 상단의 소리 버튼 — 빠른 켜기/끄기(기본 꺼짐)
 * 켜짐 = 효과음이나 배경음악 중 하나라도 켜짐. 끄면 둘 다 끄고, 켜면 효과음을 켠다(배경음악은 홈 설정에서)
 * 켜는 클릭이 곧 사용자 조작이므로 그 자리에서 AudioContext를 시작한다(iOS 자동재생 정책)
 */
export function SoundToggle({ className = "" }: { className?: string }) {
  const { settings, update } = useSoundSettings();
  const on = settings.sfx || settings.music;

  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    // 마우스로 누른 뒤 포커스가 남으면 게임의 Space(하드 드롭)가 이 버튼을 다시 누른다 — 포커스를 놓는다
    if (e.detail > 0) e.currentTarget.blur();
    if (on) {
      update({ sfx: false, music: false });
      return;
    }
    update({ sfx: true });
    getSoundPlayer().unlock();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "소리 끄기" : "소리 켜기"}
      className={`flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-900/70 text-slate-300 transition-colors ${
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
          <>
            <path d="M17 9l5 6" />
            <path d="M22 9l-5 6" />
          </>
        )}
      </svg>
    </button>
  );
}
