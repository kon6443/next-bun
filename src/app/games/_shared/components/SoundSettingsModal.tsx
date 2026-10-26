"use client";

import { useId } from "react";
import { SettingsSheet } from "@/app/components/SettingsSheet";
import { useSoundSettings } from "../hooks/useSoundSettings";
import type { SoundSettings } from "../lib/soundSettings";
import { unlockSounds } from "../lib/soundUnlock";

type Props = {
  onClose: () => void;
  /** 배경음 줄을 보일지 — 배경음이 없는 게임(디펜스)은 숨긴다(설정 값은 공통) */
  music?: boolean;
};

/**
 * 게임 공통 소리 설정 모달 (games-polish P8) — 효과음·배경음 켜기/끄기와 음량. 바꾸면 바로 적용(울리던 소리 포함)
 * 켜는 조작은 제스처 핸들러 안에서 저장 → unlockSounds()로 화면의 플레이어를 바로 깨운다(Safari·iOS 조건)
 * 껍데기(포털·키보드·배경 닫기)는 공통 SettingsSheet, 본문은 SoundSettingsSection(공통 설정 시트에서도 쓴다)
 */
export function SoundSettingsModal({ onClose, music = true }: Props) {
  return (
    <SettingsSheet title="소리 설정" testId="sound-settings" onClose={onClose}>
      <SoundSettingsSection music={music} />
    </SettingsSheet>
  );
}

/** 소리 설정 본문 — 모달·공통 설정 시트가 같이 쓴다 */
export function SoundSettingsSection({ music = true }: { music?: boolean }) {
  const { settings, update } = useSoundSettings();

  /** 저장(구독한 플레이어가 같은 호출 안에서 반영) → 켜졌으면 같은 제스처 안에서 오디오 시작 */
  const change = (partial: Partial<SoundSettings>) => {
    const next = update(partial);
    if (next.sfx || next.music) unlockSounds();
  };

  return (
    <>
      <p className="mb-3 text-xs text-slate-500">모든 게임에 함께 적용돼요. 처음에는 꺼져 있어요.</p>
      <SoundRow
        label="효과음"
        on={settings.sfx}
        volume={settings.sfxVolume}
        onToggle={(on) => change({ sfx: on })}
        onVolume={(sfxVolume) => change({ sfxVolume })}
      />
      {music && (
        <SoundRow
          label="배경음"
          on={settings.music}
          volume={settings.musicVolume}
          onToggle={(on) => change({ music: on })}
          onVolume={(musicVolume) => change({ musicVolume })}
        />
      )}
    </>
  );
}

function SoundRow({ label, on, volume, onToggle, onVolume }: { label: string; on: boolean; volume: number; onToggle: (on: boolean) => void; onVolume: (volume: number) => void }) {
  const volumeId = useId();
  const percent = Math.round(volume * 100);
  return (
    <div className="border-t border-white/5 py-2">
      <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-slate-200">
        <span>{label}</span>
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} className="h-5 w-5 shrink-0 accent-sky-400" />
      </label>
      <div className="flex items-center gap-3">
        <label htmlFor={volumeId} className="w-14 shrink-0 text-xs text-slate-400">
          음량
        </label>
        <input
          id={volumeId}
          type="range"
          min={0}
          max={100}
          step={5}
          value={percent}
          disabled={!on}
          aria-label={`${label} 음량`}
          aria-valuetext={`${percent}%`}
          onChange={(e) => onVolume(Number(e.target.value) / 100)}
          className="h-11 min-w-0 flex-1 accent-sky-400 disabled:opacity-40"
        />
        <span className="w-10 shrink-0 text-right font-mono text-xs text-sky-300">{percent}%</span>
      </div>
    </div>
  );
}
