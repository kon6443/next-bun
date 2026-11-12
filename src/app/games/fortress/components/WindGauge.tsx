"use client";

import { useEffect, useRef } from "react";
import { WIND_MAX } from "../engine";

/** 세기별 색 — 약(하늘) · 중(노랑, 최대의 40%~) · 강(빨강, 70%~). 최대(WIND_MAX)가 바뀌어도 비율로 따라간다 */
function tone(strength: number): { text: string; fill: string } {
  if (strength * 10 >= WIND_MAX * 7) return { text: "text-rose-300", fill: "bg-rose-400" };
  if (strength * 10 >= WIND_MAX * 4) return { text: "text-amber-300", fill: "bg-amber-300" };
  return { text: "text-sky-300", fill: "bg-sky-300" };
}

/**
 * 바람 게이지 — 가운데 0에서 좌우로 칸이 차는 막대 + 큰 화살표·숫자. 턴마다 값이 바뀌면 한 번 튄다(움직임 줄이기면 생략)
 * turnKey가 바뀔 때만 비교한다(같은 턴 다시 그리기에는 반응하지 않는다)
 */
export function WindGauge({ wind, turnKey }: { wind: number; turnKey: number }) {
  const strength = Math.abs(wind);
  const dir = wind < 0 ? "왼쪽" : wind > 0 ? "오른쪽" : "없음";
  const { text, fill } = tone(strength);
  const ref = useRef<HTMLDivElement>(null);
  const lastRef = useRef<{ wind: number; turnKey: number } | null>(null);

  useEffect(() => {
    const last = lastRef.current;
    lastRef.current = { wind, turnKey };
    if (!last || last.turnKey === turnKey || last.wind === wind) return;
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.animate([{ transform: "scale(1)", boxShadow: "0 0 0 0 rgba(125, 211, 252, 0)" }, { transform: "scale(1.12)", boxShadow: "0 0 0 6px rgba(125, 211, 252, 0.35)" }, { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(125, 211, 252, 0)" }], { duration: 650, easing: "ease-out" });
  }, [wind, turnKey]);

  return (
    <div ref={ref} className="pointer-events-none flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-slate-900/85 px-3 py-1.5 shadow-[0_8px_20px_rgba(2,6,23,0.5)]" role="img" aria-label={`바람 ${dir} ${strength} / ${WIND_MAX}`} data-testid="fortress-wind">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold tracking-[0.3em] text-slate-400">WIND</span>
        <span className={`text-2xl leading-none font-black ${text} ${wind < 0 ? "" : wind > 0 ? "" : "opacity-50"}`} aria-hidden>
          {wind < 0 ? "◀" : wind > 0 ? "▶" : "•"}
        </span>
        <span className={`min-w-6 text-center text-2xl leading-none font-black tabular-nums ${text}`}>{strength}</span>
      </div>
      <div className="flex items-center gap-[2px]" aria-hidden>
        {Array.from({ length: WIND_MAX }, (_, i) => {
          const on = wind < 0 && WIND_MAX - i <= strength;
          return <span key={`l${i}`} className={`h-1.5 w-[5px] rounded-sm ${on ? fill : "bg-slate-700/70"}`} />;
        })}
        <span className="mx-0.5 h-2.5 w-px bg-slate-400" />
        {Array.from({ length: WIND_MAX }, (_, i) => {
          const on = wind > 0 && i < strength;
          return <span key={`r${i}`} className={`h-1.5 w-[5px] rounded-sm ${on ? fill : "bg-slate-700/70"}`} />;
        })}
      </div>
    </div>
  );
}
