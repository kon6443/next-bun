"use client";

import { useEffect, useRef, useState } from "react";
import type { MapId } from "../engine";
import { DEFAULT_TANK_SKIN, type TankSkin } from "../lib/tankSkins";
import { SLOT_COLORS, TEAM_COLORS } from "../renderer/drawScene";
import { TankSkinPreview } from "./TankSkinPreview";

/**
 * 결과 화면 연출 조각(D-025 보충 6) — 솔로·온라인·기록 보기가 함께 쓴다(vivid)
 * 숫자 카운트업 · 등급 배지 · 꽃가루 · 승자 탱크 포즈. 움직임 줄이기면 모두 정적으로(숫자는 바로 최종값)
 */

export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** 0에서 target까지 부드럽게 올라가는 숫자 — 움직임 줄이기·테스트 환경(rAF 없음)이면 바로 target */
export function useCountUp(target: number, { duration = 900, delay = 0 }: { duration?: number; delay?: number } = {}): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() || typeof requestAnimationFrame === "undefined" ? target : 0));
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (prefersReducedMotion() || typeof requestAnimationFrame === "undefined" || target <= 0) {
      setValue(target);
      return;
    }
    startRef.current = null;
    let raf = 0;
    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now + delay;
      const k = Math.min(1, Math.max(0, (now - startRef.current) / duration));
      // 끝에서 천천히(easeOutCubic)
      setValue(Math.round(target * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay]);
  return value;
}

export type Grade = "S" | "A" | "B" | "C";

/** 한 판 등급 — 준 피해 + KO×40 + 승리 60점. S 200↑ · A 120↑ · B 60↑ · C */
export function gradeOf({ dealt, kos, won }: { dealt: number; kos: number; won: boolean }): Grade {
  const score = dealt + kos * 40 + (won ? 60 : 0);
  if (score >= 200) return "S";
  if (score >= 120) return "A";
  if (score >= 60) return "B";
  return "C";
}

const GRADE_STYLE: Record<Grade, string> = {
  S: "bg-gradient-to-b from-amber-200 to-amber-500 text-[#3a1600]",
  A: "bg-gradient-to-b from-fuchsia-300 to-violet-500 text-white",
  B: "bg-gradient-to-b from-sky-300 to-sky-600 text-white",
  C: "bg-gradient-to-b from-slate-300 to-slate-500 text-[#160b1c]",
};

/** 등급 배지 — 잉크 외곽선 원. 낭독은 "등급 S" */
export function GradeBadge({ grade, className = "" }: { grade: Grade; className?: string }) {
  return (
    <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-[#160b1c] text-sm font-black shadow-[0_2px_0_#160b1c] ${GRADE_STYLE[grade]} ${className}`} data-grade={grade}>
      <span className="sr-only">등급 </span>
      {grade}
    </span>
  );
}

/** 카운트업 숫자(텍스트) */
export function CountUp({ value, delay = 0 }: { value: number; delay?: number }) {
  return <>{useCountUp(value, { delay })}</>;
}

const CONFETTI = ["#fbbf24", "#f472b6", "#38bdf8", "#a3e635", "#fb923c"];

/** 꽃가루 — active일 때만, 움직임 줄이기면 그리지 않는다. 부모는 relative */
export function Confetti({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const show = active && !prefersReducedMotion();
  useEffect(() => {
    if (!show) return;
    const pieces = [...(ref.current?.children ?? [])] as HTMLElement[];
    const anims = pieces.map((el, i) =>
      typeof el.animate === "function"
        ? el.animate(
            [
              { transform: "translate(0, -20px) rotate(0deg)", opacity: 1 },
              { transform: `translate(${(i % 2 ? 1 : -1) * (20 + ((i * 13) % 50))}px, 520px) rotate(${360 + i * 40}deg)`, opacity: 0 },
            ],
            { duration: 1800 + (i % 5) * 260, delay: (i % 7) * 90, easing: "cubic-bezier(.3,.6,.4,1)", fill: "forwards" },
          )
        : null,
    );
    return () => anims.forEach((a) => a?.cancel());
  }, [show]);
  return (
    <div ref={ref} className="pointer-events-none absolute inset-x-0 top-0 h-0" aria-hidden data-testid="result-confetti">
      {show ? Array.from({ length: 28 }, (_, i) => <span key={i} className="absolute top-0 block h-2.5 w-1.5 rounded-sm" style={{ left: `${(i * 37) % 100}%`, background: CONFETTI[i % CONFETTI.length] }} />) : null}
    </div>
  );
}

/** 승자 탱크 — 미리보기 캔버스를 깡충 뛰는 포즈로(움직임 줄이기면 제자리). label은 그림 설명 */
export function HeroTanks({ tanks, label, mapId, className = "h-36" }: { tanks: readonly { skin: TankSkin; color: string; label?: string }[]; label: string; mapId?: MapId; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof el.animate !== "function") return;
    const anim = el.animate(
      [
        { transform: "translateY(0) scale(1)" },
        { transform: "translateY(-10px) scale(1.03, 0.98)", offset: 0.3 },
        { transform: "translateY(0) scale(1.04, 0.95)", offset: 0.55 },
        { transform: "translateY(0) scale(1)" },
      ],
      { duration: 900, delay: 350, iterations: 3, easing: "ease-out" },
    );
    return () => anim.cancel();
  }, []);
  return (
    <div ref={ref} data-testid="result-hero">
      <TankSkinPreview tanks={tanks} look="vivid" mapId={mapId} className={className} label={label} />
    </div>
  );
}

/** 준 피해 막대 + 숫자 — 함께 0에서 올라간다(카운트업). 낭독은 막대의 "준 피해 N"(숫자는 보이기용) */
export function DamageBar({ value, max, delay = 0, large = false }: { value: number; max: number; delay?: number; large?: boolean }) {
  const shown = useCountUp(value, { delay });
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className={`${large ? "lg:h-3" : ""} h-2 flex-1 overflow-hidden rounded-full border border-[#160b1c] bg-[#120a26]`} role="img" aria-label={`준 피해 ${value}`}>
        {/* 너비 대신 scaleX — 카운트업 중 레이아웃을 다시 계산하지 않게(transform만 애니메이션) */}
        <div className="h-full origin-left rounded-full bg-gradient-to-r from-amber-300 to-rose-400" style={{ transform: `scaleX(${shown / Math.max(1, max)})` }} data-testid="damage-fill" />
      </div>
      <span className={`w-10 text-right text-xs font-bold tabular-nums text-white ${large ? "lg:text-sm" : ""}`} aria-hidden>
        {shown}
      </span>
    </div>
  );
}

/** 결과 행(온라인·기록 보기)에서 승자 탱크 — 1위들, 색은 팀전이면 팀 색·아니면 자리 색, 스킨은 그 경기 스킨(없으면 기본) */
export function winnerTanks(players: readonly { slot: number; team: 0 | 1 | null; place: number; name: string }[], skins?: readonly (TankSkin | undefined)[]) {
  return players
    .filter((p) => p.place === 1)
    .map((p) => ({ skin: skins?.[p.slot] ?? DEFAULT_TANK_SKIN, color: p.team !== null ? TEAM_COLORS[p.team] : SLOT_COLORS[p.slot % SLOT_COLORS.length], label: p.name }));
}
