"use client";

import Link from "next/link";
import type { HudSnapshot } from "../hooks/useDefensePlay";

/**
 * 플레이 화면 상단 (defense DESIGN §F2) — 목숨 ♥ · 골드 · 웨이브 n/N(무한·주간은 n) · 일시정지 · 배속(1→2→3×)
 * 숫자는 data-value로도 싣는다(메인 Playwright가 골드를 읽어 건설 시점을 정한다)
 */
type Props = {
  hud: HudSnapshot;
  exitHref: string;
  /** 판 중 나가기 확인 — 부르면 링크 이동을 막고 확인 대화상자를 띄운다(§F9b) */
  onRequestExit?: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
  onTogglePause: () => void;
  onCycleSpeed: () => void;
  /** 웨이브 총수를 보일지 — 무한·주간은 끝이 정해지지 않아 n만(§F2) */
  showTotalWaves?: boolean;
  /** 나가기 버튼의 접근성 이름 — 캠페인은 스테이지 화면, 무한·주간은 디펜스 처음 */
  exitLabel?: string;
};

export function Hud({ hud, exitHref, onRequestExit, soundOn, onToggleSound, onTogglePause, onCycleSpeed, showTotalWaves = true, exitLabel = "스테이지 화면으로 나가기" }: Props) {
  const paused = hud.status === "paused";
  // 320px까지 한 줄 — 글자는 폭 따라 12~14px, 줄바꿈 금지(넘치면 숫자 칸을 자른다), 버튼은 44px 높이·40px 폭
  return (
    <header className="flex items-center gap-1 whitespace-nowrap px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm">
      <Link
        replace
        href={exitHref}
        data-testid="defense-exit"
        onClick={(e) => {
          if (!onRequestExit) return;
          e.preventDefault();
          onRequestExit();
        }}
        aria-label={exitLabel}
        className="flex min-h-11 min-w-10 items-center justify-center rounded-full border border-white/15 text-slate-300"
      >
        ←
      </Link>
      <dl className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-[clamp(0.75rem,3.6vw,0.875rem)] tabular-nums">
        {/* 기호는 보조기술에서 숨기고 이름은 sr-only로 — dt의 aria-label은 iOS VoiceOver가 읽지 않는다. 좁으면 골드 칸부터 줄인다(웨이브는 안 자른다) */}
        <div className="flex shrink-0 items-center gap-0.5" data-testid="defense-lives" data-value={hud.lives}>
          <dt>
            <span aria-hidden="true">♥</span>
            <span className="sr-only">목숨</span>
          </dt>
          <dd className="font-semibold text-rose-200">{hud.lives}</dd>
        </div>
        <div className="flex min-w-0 items-center gap-0.5" data-testid="defense-gold" data-value={hud.gold}>
          <dt>
            <span aria-hidden="true">◆</span>
            <span className="sr-only">골드</span>
          </dt>
          <dd className="truncate font-semibold text-amber-200">{hud.gold}</dd>
        </div>
        <div className="flex shrink-0 items-center gap-0.5" data-testid="defense-wave" data-value={hud.wavesStarted} data-total={hud.totalWaves}>
          <dt className="text-slate-400">
            <span aria-hidden="true">W</span>
            <span className="sr-only">웨이브</span>
          </dt>
          <dd className="font-semibold">
            {/* 화면은 공백 없는 짧은 표기(줄이 꺾일 자리 없음), 읽기는 "12 / 12"(날짜로 읽히지 않게) */}
            <span aria-hidden="true">
              {showTotalWaves ? `${hud.wavesStarted}/${hud.totalWaves}` : hud.wavesStarted}
            </span>
            <span className="sr-only">
              {showTotalWaves ? `${hud.wavesStarted} / ${hud.totalWaves}` : hud.wavesStarted}
            </span>
          </dd>
        </div>
      </dl>
      <button
        type="button"
        data-testid="defense-sound"
        data-value={soundOn ? "on" : "off"}
        aria-pressed={soundOn}
        aria-label="효과음"
        onClick={onToggleSound}
        className="min-h-11 min-w-10 rounded-full border border-white/15 text-base"
      >
        <span aria-hidden="true">{soundOn ? "🔊" : "🔇"}</span>
      </button>
      <button
        type="button"
        data-testid="defense-speed"
        data-value={hud.speed}
        disabled={hud.status === "over"}
        onClick={onCycleSpeed}
        aria-label={`배속 ${hud.speed}배 — 누르면 바꿔요 (F)`}
        className="min-h-11 min-w-10 rounded-full border border-white/15 px-1.5 font-semibold tabular-nums text-slate-100 disabled:opacity-40"
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
        className="min-h-11 min-w-10 rounded-full border border-white/15 font-semibold text-slate-100 disabled:opacity-40"
      >
        {paused ? "▶" : "Ⅱ"}
      </button>
    </header>
  );
}
