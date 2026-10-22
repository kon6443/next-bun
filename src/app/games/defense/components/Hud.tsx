"use client";

import Link from "next/link";
import type { HudSnapshot } from "../hooks/useDefensePlay";

/**
 * 플레이 화면 상단 (defense DESIGN §F2) — 목숨 ♥ · 골드 · 웨이브 n/N · 일시정지 · 배속(1→2→3×)
 * 숫자는 data-value로도 싣는다(메인 Playwright가 골드를 읽어 건설 시점을 정한다)
 */
type Props = {
  hud: HudSnapshot;
  exitHref: string;
  onTogglePause: () => void;
  onCycleSpeed: () => void;
};

export function Hud({ hud, exitHref, onTogglePause, onCycleSpeed }: Props) {
  const paused = hud.status === "paused";
  return (
    <header className="flex items-center gap-2 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm">
      <Link
        replace
        href={exitHref}
        aria-label="스테이지 화면으로 나가기"
        className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/15 text-slate-300"
      >
        ←
      </Link>
      <dl className="flex flex-1 items-center gap-3 tabular-nums">
        <div className="flex items-center gap-1" data-testid="defense-lives" data-value={hud.lives}>
          <dt aria-label="목숨">♥</dt>
          <dd className="font-semibold text-rose-200">{hud.lives}</dd>
        </div>
        <div className="flex items-center gap-1" data-testid="defense-gold" data-value={hud.gold}>
          <dt aria-label="골드">◆</dt>
          <dd className="font-semibold text-amber-200">{hud.gold}</dd>
        </div>
        <div className="flex items-center gap-1" data-testid="defense-wave" data-value={hud.wavesStarted} data-total={hud.totalWaves}>
          <dt className="text-slate-400">웨이브</dt>
          <dd className="font-semibold">
            {hud.wavesStarted} / {hud.totalWaves}
          </dd>
        </div>
      </dl>
      <button
        type="button"
        data-testid="defense-speed"
        data-value={hud.speed}
        disabled={hud.status === "over"}
        onClick={onCycleSpeed}
        aria-label={`배속 ${hud.speed}배 — 누르면 바꿔요 (F)`}
        className="min-h-11 min-w-11 rounded-full border border-white/15 px-2 font-semibold tabular-nums text-slate-100 disabled:opacity-40"
      >
        {hud.speed}×
      </button>
      <button
        type="button"
        data-testid="defense-pause"
        aria-pressed={paused}
        disabled={hud.status === "over"}
        onClick={onTogglePause}
        aria-label={paused ? "계속하기 (P)" : "일시정지 (P)"}
        className="min-h-11 min-w-11 rounded-full border border-white/15 font-semibold text-slate-100 disabled:opacity-40"
      >
        {paused ? "▶" : "Ⅱ"}
      </button>
    </header>
  );
}
