"use client";

import { useEffect, useMemo, useRef } from "react";
import * as engine from "../engine";
import { slotColor } from "../hooks/useBattleView";
import { type ReplayData, buildReplay, summarizeReplay } from "../lib/replay";
import { Button } from "@/app/teams/components/Button";
import { type Controller, playerName } from "./FortressMatch";
import { CARD, EYEBROW } from "./fortressUi";
import { useResultMusic } from "../lib/sound/useResultMusic";

const TEAM_NAMES = ["파랑", "주황"];

/** 경기 결과 — 승패·요약(턴 수, 준 피해, KO)과 다시 보기·다시하기·설정으로. 요약은 기록을 다시 돌려 낸다(리플레이와 같은 근거) */
export function FortressResult({ data, controllers, onReplay, onRematch, onSetup }: { data: ReplayData; controllers: Controller[]; onReplay: () => void; onRematch: () => void; onSetup: () => void }) {
  useResultMusic();
  const built = useMemo(() => buildReplay(engine, data), [data]);
  // 경기 화면에서 넘어오면 포커스가 body로 빠진다 — 제목으로 옮겨 낭독기가 결과부터 읽게
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

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
  // 사람이 한 명(AI전)이면 그 사람 기준으로 한 줄 더
  const verdict = humans.length === 1 && result.kind === "win" ? (winners.includes(humans[0]) ? "이겼어요!" : "졌어요") : null;

  return (
    // 루트 layout이 이미 <main>으로 감싼다 — 중첩하지 않는다
    <div className="h-full bg-gradient-to-b from-[#070b1d] via-[#141a3d] to-[#2a2350] overflow-y-auto overscroll-contain px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]" style={{ touchAction: "pan-y" }} data-testid="fortress-result">
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <header className={`${CARD} text-center`}>
          <p className={EYEBROW}>RESULT</p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-2 text-3xl font-bold text-white outline-none">
            {headline}
          </h1>
          {verdict ? <p className={`mt-1 text-sm ${winners.includes(humans[0]) ? "text-amber-300" : "text-slate-400"}`}>{verdict}</p> : null}
          <p className="mt-2 text-sm text-slate-400" data-testid="fortress-result-turns">
            {summary.turns}턴
          </p>
        </header>

        <section className={`${CARD} px-4 py-3`}>
        <table className="w-full text-sm">
          <caption className="sr-only">플레이어별 요약</caption>
          <thead>
            <tr className="text-xs text-slate-400">
              <th scope="col" className="py-2 text-left font-normal">
                플레이어
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                남은 HP
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                준 피해
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                KO
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.slots.map((s) => (
              <tr key={s.slot} className={`border-t border-slate-700/50 ${controllers[s.slot] === "human" ? "bg-sky-500/10" : ""}`}>
                <th scope="row" className="py-2.5 text-left font-normal">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slotColor(final, s.slot) }} aria-hidden />
                    <span className={winners.includes(s.slot) ? "font-semibold text-amber-200" : "text-slate-200"}>{playerName(controllers, s.slot)}</span>
                    {final.mode === "team" ? <span className="text-xs text-slate-500">{TEAM_NAMES[s.team]}</span> : null}
                    {winners.includes(s.slot) ? <span className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] text-amber-200">승리</span> : null}
                  </span>
                </th>
                <td className="py-2.5 text-right tabular-nums text-slate-300">{s.alive ? s.hp : "탈락"}</td>
                <td className="py-2.5 text-right tabular-nums text-slate-100">{s.dealt}</td>
                <td className="py-2.5 text-right tabular-nums text-slate-100">{s.kos}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </section>

        <div className="flex flex-col gap-2">
          <Button type="button" size="md" fullWidth className="min-h-12 text-base" onClick={onRematch} data-testid="fortress-rematch">
            다시하기
          </Button>
          <Button type="button" variant="secondary" size="md" fullWidth className="min-h-12 text-base" onClick={onReplay} data-testid="fortress-replay">
            다시 보기
          </Button>
          <button type="button" onClick={onSetup} className="min-h-11 rounded-full px-2 text-sm text-sky-300">
            설정 바꾸기
          </button>
        </div>
      </div>
    </div>
  );
}
