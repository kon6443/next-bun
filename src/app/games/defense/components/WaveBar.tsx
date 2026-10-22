"use client";

import { TICKS_PER_SECOND } from "../engine";
import type { HudSnapshot } from "../hooks/useDefensePlay";
import { ENEMY_NAMES } from "../lib/labels";
import type { PreviewEntry } from "../lib/wavePreview";

/**
 * 플레이 화면 하단 (defense DESIGN §F2) — 다음 웨이브 미리보기(적·수·지상/공중) + 웨이브 호출(조기 호출 보너스 실시간)
 * 공중은 날개 기호로도 표시(색만으로 구분하지 않는다, §F0-4)
 */
type Props = {
  hud: HudSnapshot;
  preview: readonly PreviewEntry[];
  onCall: () => void;
};

export function WaveBar({ hud, preview, onCall }: Props) {
  const first = hud.wavesStarted === 0;
  const seconds = Math.ceil(hud.countdown / TICKS_PER_SECOND);
  const label = first ? "웨이브 시작" : hud.earlyBonus > 0 ? `지금 호출 +${hud.earlyBonus}` : "웨이브 호출";
  return (
    <footer className="flex items-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
      <section aria-label="다음 웨이브" className="min-w-0 flex-1" data-testid="defense-preview">
        {preview.length > 0 ? (
          <>
            <p className="text-[11px] text-slate-400">
              다음 웨이브 {hud.wavesStarted + 1}
              {!first && hud.countdown > 0 && <span className="ml-1 tabular-nums">· {seconds}초 뒤</span>}
            </p>
            <ul className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-200">
              {preview.map((entry) => (
                <li key={entry.enemyId} className="flex items-center gap-1 tabular-nums">
                  <span className={`rounded px-1 text-[10px] ${entry.air ? "bg-sky-500/25 text-sky-200" : "bg-stone-500/30 text-stone-200"}`}>
                    {entry.air ? "공중" : "지상"}
                  </span>
                  {ENEMY_NAMES[entry.enemyId]} ×{entry.count}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-xs text-slate-400">마지막 웨이브예요</p>
        )}
      </section>
      <button
        type="button"
        data-testid="defense-call-wave"
        disabled={!hud.canCall}
        onClick={onCall}
        aria-label={`${label} (Space)`}
        className="min-h-12 shrink-0 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 px-4 text-sm font-bold text-white shadow-lg shadow-rose-500/30 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-400 disabled:shadow-none"
      >
        {label}
      </button>
    </footer>
  );
}
