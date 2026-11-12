"use client";

import { useEffect, useMemo, useRef } from "react";
import * as engine from "../engine";
import { slotColor } from "../hooks/useBattleView";
import { type ReplayData, buildReplay, summarizeReplay } from "../lib/replay";
import { DEFAULT_TANK_SKIN, type TankSkin } from "../lib/tankSkins";
import { Button } from "@/app/teams/components/Button";
import { type Controller, playerName } from "./FortressMatch";
import vividStyles from "./fortressVivid.module.css";
import { CountUp, Confetti, DamageBar, GradeBadge, HeroTanks, gradeOf, prefersReducedMotion } from "./resultFlair";
import { useResultMusic } from "../lib/sound/useResultMusic";

const TEAM_NAMES = ["파랑", "주황"];

/**
 * 결과 연출 시안(D-025 B, look이 classic이 아닐 때) — 승자 탱크(장착 스킨)·승패 큰 글씨·꽃가루·MVP 카드·플레이어별 피해 막대
 * 데이터는 기본 결과 화면과 같다(기록을 다시 돌린 요약 — 백엔드 계약 그대로). 버튼·testid도 같다
 * 꽃가루·등장 애니메이션은 움직임 줄이기면 끈다
 */
export function FortressResultVivid({
  data,
  controllers,
  skins,
  onReplay,
  onRematch,
  onSetup,
}: {
  data: ReplayData;
  controllers: Controller[];
  skins?: readonly TankSkin[];
  onReplay: () => void;
  onRematch: () => void;
  onSetup: () => void;
}) {
  const built = useMemo(() => buildReplay(engine, data), [data]);
  useResultMusic();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  const reduced = prefersReducedMotion();
  // 등장 — 카드가 차례로 떠오른다(꽃가루·승자 포즈·숫자 카운트업은 resultFlair)
  useEffect(() => {
    if (reduced) return;
    const root = rootRef.current;
    const cards = root?.querySelectorAll<HTMLElement>("[data-rise]") ?? [];
    // 버튼 묶음(data-rise="fast")은 지연 없이 0.22초 — 결과를 빨리 넘기려는 사람을 기다리게 하지 않는다(연출 중에도 늘 눌린다)
    const anims = [...cards].map((el, i) =>
      typeof el.animate === "function"
        ? el.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], el.dataset.rise === "fast" ? { duration: 220, easing: "ease-out", fill: "backwards" } : { duration: 420, delay: 120 + i * 90, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" })
        : null,
    );
    return () => anims.forEach((a) => a?.cancel());
  }, [reduced]);

  if (!built.ok) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-slate-300" role="alert">
          결과를 계산하지 못했어요. ({built.reason})
        </p>
        <Button type="button" variant="secondary" size="md" className="min-h-11" onClick={onSetup}>
          설정으로
        </Button>
      </div>
    );
  }

  const { final } = built.replay;
  const summary = summarizeReplay(built.replay);
  const result = final.result;
  const winners = result.kind === "win" ? result.slots : [];
  const headline =
    result.kind === "draw" ? "무승부" : result.kind === "win" ? (result.team !== undefined ? `${TEAM_NAMES[result.team]} 팀 승리` : `${playerName(controllers, result.slots[0])} 승리`) : "경기 중단";
  const humans = controllers.map((c, slot) => (c === "human" ? slot : -1)).filter((s) => s >= 0);
  const won = humans.length === 1 && winners.includes(humans[0]);
  const verdict = humans.length === 1 && result.kind === "win" ? (won ? "VICTORY" : "DEFEAT") : result.kind === "draw" ? "DRAW" : "RESULT";
  const mvp = [...summary.slots].sort((a, b) => b.dealt - a.dealt || b.kos - a.kos)[0];
  const maxDealt = Math.max(1, ...summary.slots.map((s) => s.dealt));
  const hero = winners[0] ?? mvp?.slot ?? 0;
  const heroTanks = (winners.length ? winners : [hero]).map((slot) => ({ skin: skins?.[slot] ?? DEFAULT_TANK_SKIN, color: slotColor(final, slot), label: playerName(controllers, slot) }));

  return (
    <div
      className={`${vividStyles.vivid} relative h-full overflow-y-auto overscroll-contain bg-[radial-gradient(120%_70%_at_50%_0%,#4c2a6b_0%,#1b1338_45%,#0b0a1c_100%)] px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]`}
      style={{ touchAction: "pan-y" }}
      data-testid="fortress-result"
    >
      {/* 꽃가루 — 이긴 판만, 움직임 줄이기면 그리지 않는다 */}
      <Confetti active={won} />
      {/* 넓은 화면 — 두 열(왼쪽 제목·승자·MVP·버튼 / 오른쪽 플레이어 행), 열마다 약 470px에 글자·행·버튼을 함께 키워 390과 비슷한 체감 비율로(1280×800에서 스크롤 없이) */}
      <div ref={rootRef} className="relative mx-auto flex max-w-md flex-col gap-3 lg:grid lg:max-w-[980px] lg:grid-cols-2 lg:content-center lg:gap-x-8 lg:gap-y-4 lg:pt-6">
        <header className="text-center lg:col-start-1" data-rise>
          <p className={`text-xs font-black tracking-[0.6em] lg:text-sm ${won ? "text-amber-300" : verdict === "DEFEAT" ? "text-rose-300" : "text-sky-300"}`}>{verdict}</p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-1 bg-gradient-to-b from-white to-amber-200 bg-clip-text text-4xl font-black text-transparent lg:text-6xl outline-none drop-shadow-[0_2px_12px_rgba(251,191,36,0.35)]">
            {headline}
          </h1>
          <p className="mt-1 text-sm text-slate-300 lg:text-base" data-testid="fortress-result-turns">
            {summary.turns}턴
          </p>
        </header>

        <div className="overflow-hidden rounded-3xl border border-amber-200/20 bg-slate-900/60 shadow-[0_12px_40px_rgba(251,146,60,0.18)] lg:col-start-1" data-rise data-hud="card">
          <HeroTanks tanks={heroTanks} mapId={final.mapId} className="h-36 lg:h-52" label={`승리한 탱크: ${heroTanks.map((t) => t.label).join(", ")}`} />
        </div>

        {mvp ? (
          <section className="flex items-center gap-3 rounded-2xl border border-amber-300/30 bg-gradient-to-r from-amber-500/20 to-rose-500/10 px-4 py-3 lg:col-start-1 lg:py-4 lg:text-lg" aria-label="MVP" data-rise>
            <span className="rounded-lg bg-amber-400 px-2 py-1 text-xs font-black text-slate-900">MVP</span>
            <span className="min-w-0 flex-1 truncate font-bold text-white">{playerName(controllers, mvp.slot)}</span>
            <span className="text-sm tabular-nums text-amber-100">
              피해 <b className="text-base">
                <CountUp value={mvp.dealt} delay={300} />
              </b>{" "}
              · KO <b className="text-base">{mvp.kos}</b>
            </span>
          </section>
        ) : null}

        <section className="flex flex-col gap-2 lg:col-start-2 lg:row-span-4 lg:row-start-1 lg:justify-center lg:gap-3" aria-label="플레이어별 요약" data-rise>
          {summary.slots.map((s, i) => (
            <div key={s.slot} className={`rounded-2xl border px-3 py-2.5 lg:px-4 lg:py-4 ${winners.includes(s.slot) ? "border-amber-300/40 bg-amber-400/10" : "border-white/10 bg-slate-900/60"}`} data-hud="card" data-win={winners.includes(s.slot) || undefined}>
              <div className="flex items-center gap-2 text-sm lg:text-base">
                <GradeBadge grade={gradeOf({ dealt: s.dealt, kos: s.kos, won: winners.includes(s.slot) })} />
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slotColor(final, s.slot) }} aria-hidden />
                <span className={`min-w-0 flex-1 truncate ${winners.includes(s.slot) ? "font-bold text-amber-100" : "text-slate-100"}`}>
                  {playerName(controllers, s.slot)}
                  {final.mode === "team" ? <span className="ml-1 text-xs text-slate-400">{TEAM_NAMES[s.team]}</span> : null}
                </span>
                <span className="text-xs tabular-nums text-slate-300 lg:text-sm">{s.alive ? `HP ${s.hp}` : "탈락"}</span>
                <span className="w-16 text-right text-xs tabular-nums text-slate-300 lg:text-sm">KO {s.kos}</span>
              </div>
              <DamageBar value={s.dealt} max={maxDealt} delay={250 + i * 120} large />
            </div>
          ))}
        </section>

        <div className="mt-1 flex flex-col gap-2 lg:col-start-1" data-rise="fast">
          <Button type="button" size="md" fullWidth className="min-h-12 text-base lg:min-h-14 lg:text-lg" onClick={onRematch} data-testid="fortress-rematch">
            다시하기
          </Button>
          <Button type="button" variant="secondary" size="md" fullWidth className="min-h-12 text-base lg:min-h-14 lg:text-lg" onClick={onReplay} data-testid="fortress-replay">
            다시 보기
          </Button>
          <button type="button" onClick={onSetup} className="min-h-11 rounded-full px-2 text-sm text-sky-300 lg:text-base">
            설정 바꾸기
          </button>
        </div>
      </div>
    </div>
  );
}
