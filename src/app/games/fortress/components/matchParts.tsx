"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/app/games/_shared/lib/motion";
import type { AngleView } from "../lib/aimAngle";

/** 경기 화면 조각 — 상단 플레이어 칸·각도 글자·누르고 있는 버튼·차례 띠(FortressMatch에서 나눔) */
/** 상단 플레이어 칸 — 차례인 사람은 노란 테두리, HP 막대 */
export function PlayerChip({ name, ai, color, hp, maxHp, alive, active }: { name: string; ai: string | null; color: string; hp: number; maxHp: number; alive: boolean; active: boolean }) {
  return (
    <li
      className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-2 py-1 text-xs ${active ? "border-amber-300/70 bg-amber-400/10" : "border-slate-700/60 bg-slate-900/70"} ${alive ? "" : "opacity-40"}`}
      aria-current={active ? "true" : undefined}
      data-hud="player"
    >
      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden data-hud="dot" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={`truncate font-semibold ${active ? "text-amber-200" : "text-slate-200"} ${alive ? "" : "line-through"}`}>
          {name}
          {ai ? (
            <span className="ml-1 text-[11px] font-normal text-slate-400" data-hud="ai">
              {ai}
            </span>
          ) : null}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1 w-10 overflow-hidden rounded-full bg-slate-800" aria-hidden data-hud="hp">
            <span className="block h-full rounded-full bg-emerald-400" style={{ width: `${Math.max(0, Math.min(100, (hp / maxHp) * 100))}%` }} />
          </span>
          {/* 숫자는 보이기용(좁은 시안 화면에서는 숨긴다) — 낭독은 아래 sr-only가 늘 맡는다 */}
          <span className="tabular-nums text-slate-400" aria-hidden data-hud="hp-num">
            {hp}
          </span>
          <span className="sr-only">HP {hp}</span>
        </span>
      </span>
    </li>
  );
}

/** 각도 표기 — 방향 화살표(낭독은 "오른쪽" 등 낱말) + 높이. 수직은 방향 없이(지난 발) */
export function AngleText({ view }: { view: AngleView }) {
  return (
    <>
      {view.arrow ? <span aria-hidden="true">{view.arrow} </span> : null}
      <span className="sr-only">{view.word} </span>
      {view.height}°
    </>
  );
}

/** 누르고 있으면 반복(포인터), 키보드·보조기술 클릭(detail 0)이면 한 번 */
export function HoldButton({
  label,
  step,
  hold,
  release,
  wide = false,
  atLimit = false,
  children,
}: {
  label: string;
  step: () => void;
  hold: (fn: () => void) => void;
  release: () => void;
  wide?: boolean;
  /** 그 방향으로 더 못 간다 — 흐리게, 누르면 이유 안내(step이 막힌 걸 알린다) */
  atLimit?: boolean;
  children: React.ReactNode;
}) {
  // 누른 채 사라지면(턴이 AI로 넘어가 조작부가 바뀜) pointerup이 오지 않는다 — 언마운트 때 놓는다
  const releaseRef = useRef(release);
  releaseRef.current = release;
  useEffect(() => () => releaseRef.current(), []);
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={atLimit || undefined}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        hold(step);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        if (e.detail === 0) step();
      }}
      data-hud="key"
      className={`min-h-11 min-w-11 ${wide ? "flex-1" : ""} rounded-xl border border-white/15 bg-slate-800/80 text-lg text-slate-100 active:bg-slate-700 ${atLimit ? "opacity-40" : ""}`}
    >
      {children}
    </button>
  );
}

/** 턴 전환 — 화면 가운데 큰 글씨가 잠깐 떴다 사라진다(움직임 줄이기면 띄우지 않는다, 위쪽 차례 표시는 그대로) */
export function TurnBanner({ name, color, mine = false }: { name: string; color: string; mine?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function" || prefersReducedMotion()) {
      setDone(true);
      return;
    }
    // 띠가 왼쪽에서 미끄러져 들어와 잠깐 멈췄다가 오른쪽으로 빠진다
    const anim = el.animate(
      [
        { opacity: 0, transform: "translateX(-60px) skewX(-12deg)" },
        { opacity: 1, transform: "translateX(0) skewX(-12deg)", offset: 0.16 },
        { opacity: 1, transform: "translateX(6px) skewX(-12deg)", offset: 0.78 },
        { opacity: 0, transform: "translateX(70px) skewX(-12deg)" },
      ],
      { duration: 1500, easing: "ease-out", fill: "forwards" },
    );
    anim.onfinish = () => setDone(true);
    return () => anim.cancel();
  }, []);
  if (done) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[36%] flex justify-center" aria-hidden>
      <div ref={ref} className="relative w-[min(92%,30rem)] opacity-0">
        {/* 띠 — 연기·폭발 위에서도 읽히게 짙은 판 + 잉크 외곽선(가운데에 차례 색 줄) */}
        <div className="absolute inset-0 rounded-lg border-2 border-[#160b1c] bg-[#241a4a]/92 shadow-[inset_0_2px_0_rgba(255,255,255,0.18),0_4px_0_#160b1c]" />
        <div className="absolute inset-x-3 bottom-1.5 h-1 rounded-full opacity-90" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
        <div className="relative skew-x-[12deg] px-6 py-3 text-center">
          <p className="text-[11px] font-black tracking-[0.5em]" style={{ color }}>
            {mine ? "YOUR TURN" : "TURN"}
          </p>
          <p className="mt-0.5 text-3xl font-black text-white [text-shadow:0_2px_0_rgba(0,0,0,0.6),0_0_18px_rgba(255,190,120,0.45)]">{name}</p>
        </div>
      </div>
    </div>
  );
}
