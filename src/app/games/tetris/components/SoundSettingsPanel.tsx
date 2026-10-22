"use client";

import { useEffect } from "react";
import { useSoundSettings } from "../hooks/useSoundSettings";
import { getSoundPlayer } from "../lib/sound/soundPlayer";

const VOLUME_ID = "tetris-sound-volume";

/**
 * 테트리스 홈 설정 섹션의 소리 블록 — 효과음·배경음악 토글과 볼륨
 * 켜는 체크 자체가 사용자 조작이므로 그 자리에서 AudioContext를 시작한다
 */
export function SoundSettingsPanel({ className = "" }: { className?: string }) {
  const { settings, update } = useSoundSettings();
  const percent = Math.round(settings.volume * 100);

  const toggle = (key: "sfx" | "music", on: boolean) => {
    update({ [key]: on });
    if (on) getSoundPlayer().unlock();
  };

  // 플레이어를 미리 만들어 둔다 — 소리를 켜 둔 채 들어온 경우 첫 조작에서 오디오가 시작되게
  useEffect(() => {
    getSoundPlayer();
  }, []);

  /** 볼륨을 놓았을 때 한 번 들려준다 — 조작 핸들러 안이라 여기서 오디오를 시작한다. 효과음이 꺼져 있으면 무시 */
  const preview = () => {
    const player = getSoundPlayer();
    player.unlock();
    player.play({ kind: "rotate" });
  };
  /** 값을 바꾸는 키에서만 — Tab으로 지나가며 떼는 것은 무시 */
  const previewKey = (e: React.KeyboardEvent) => {
    if (/^(Arrow|Home|End|Page)/.test(e.key)) preview();
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-slate-300">
        <span>효과음</span>
        <input
          type="checkbox"
          checked={settings.sfx}
          onChange={(e) => toggle("sfx", e.target.checked)}
          className="h-5 w-5 shrink-0 accent-sky-400"
        />
      </label>
      <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-slate-300">
        <span>배경음악</span>
        <input
          type="checkbox"
          checked={settings.music}
          onChange={(e) => toggle("music", e.target.checked)}
          className="h-5 w-5 shrink-0 accent-sky-400"
        />
      </label>
      <div>
        <div className="flex items-center justify-between text-sm">
          <label htmlFor={VOLUME_ID} className="text-slate-300">
            볼륨
          </label>
          <span className="font-mono text-sky-300">{percent}%</span>
        </div>
        <input
          id={VOLUME_ID}
          type="range"
          min={0}
          max={100}
          step={5}
          value={percent}
          onChange={(e) => update({ volume: Number(e.target.value) / 100 })}
          onPointerUp={preview}
          onKeyUp={previewKey}
          aria-describedby={`${VOLUME_ID}-hint`}
          className="mt-1 h-11 w-full accent-sky-400"
        />
        <p id={`${VOLUME_ID}-hint`} className="text-xs text-slate-500">
          소리는 기본으로 꺼져 있어요. 켜면 이 기기에 저장돼요.
        </p>
      </div>
    </div>
  );
}
