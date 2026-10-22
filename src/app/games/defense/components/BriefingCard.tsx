"use client";

import { useDialog } from "@/app/hooks/useDialog";
import type { Briefing } from "../lib/briefings";
import { ENEMY_NAMES, ENEMY_TRAITS, TOWER_NAMES, TOWER_ROLES } from "../lib/labels";

/**
 * 브리핑 카드 (defense DESIGN §F5) — 새 요소가 처음 나오는 스테이지 시작 때 1장(판은 아직 시작 전이라 멈출 것이 없다)
 * 도감에서도 같은 카드를 다시 본다(onClose 없이 목록으로)
 */
type Props = { briefing: Briefing; onClose?: () => void };

export function BriefingCard({ briefing, onClose }: Props) {
  // 대화상자일 때만 — 포커스를 안에 가두고 Esc로 닫는다(도감 목록에서는 쓰지 않는다)
  const dialogRef = useDialog<HTMLElement>(!!onClose, onClose ?? noop);
  const body = (
    <>
      <h2 className="text-lg font-bold text-white">{briefing.title}</h2>
      <ul className="mt-2 grid gap-1 text-sm text-slate-200">
        {briefing.lines.map((line) => (
          <li key={line}>· {line}</li>
        ))}
      </ul>
      {(briefing.towers.length > 0 || briefing.enemies.length > 0) && (
        <dl className="mt-3 grid gap-1 text-xs">
          {briefing.towers.map((t) => (
            <div key={`t${t}`} className="flex gap-2">
              <dt className="shrink-0 rounded bg-emerald-500/20 px-1.5 text-emerald-200">타워</dt>
              <dd className="text-slate-300">
                {TOWER_NAMES[t]} — {TOWER_ROLES[t]}
              </dd>
            </div>
          ))}
          {briefing.enemies.map((e) => (
            <div key={`e${e}`} className="flex gap-2">
              <dt className="shrink-0 rounded bg-rose-500/20 px-1.5 text-rose-200">적</dt>
              <dd className="text-slate-300">
                {ENEMY_NAMES[e]} — {ENEMY_TRAITS[e]}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
  if (!onClose) return <article className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-4">{body}</article>;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/80 p-4">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={briefing.title} data-testid="defense-briefing" className="focus:outline-none w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900 p-5 shadow-2xl shadow-black/60">
        {body}
        <button
          type="button"
          data-testid="defense-briefing-close"
          onClick={onClose}
          className="mt-4 min-h-11 w-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 text-sm font-semibold text-white"
        >
          알겠어요
        </button>
      </section>
    </div>
  );
}

function noop() {}
