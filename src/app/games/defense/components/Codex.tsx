"use client";

import { BRIEFINGS } from "../lib/briefings";
import { CAMPAIGN } from "../lib/campaign";
import { ENEMY_NAMES, ENEMY_TRAITS, TOWER_NAMES, TOWER_ROLES } from "../lib/labels";
import { useProgress } from "../hooks/useProgress";
import { isStageUnlocked } from "../lib/progress";
import { BriefingCard } from "./BriefingCard";

/**
 * 도감 (defense DESIGN §F5) — 열린 스테이지의 타워 · 만난 적 · 브리핑 카드 다시 보기. 기기 저장(진행)만 읽는다
 * 아직 모르는 것은 「???」 — 이름만 가리고 자리 수는 보여 준다(남은 것이 얼마나 되는지 알 수 있게)
 */
export function Codex() {
  const progress = useProgress();
  // 읽기 전에는 비워 둔다 — 모두 「???」로 깜빡이지 않게 (FE-44)
  if (!progress) return <div className="grid gap-4" aria-busy="true" />;

  const unlockedStages = CAMPAIGN.filter((s) => isStageUnlocked(progress, s.id));
  const towers = new Set(unlockedStages.flatMap((s) => s.towers));
  const met = new Set(progress.metEnemies ?? []);
  const briefings = BRIEFINGS.filter((b) => unlockedStages.some((s) => s.id === b.stageId));

  return (
    <div className="grid gap-4">
      <section className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-4" aria-labelledby="codex-towers">
        <h2 id="codex-towers" className="text-lg font-semibold text-white">
          타워 <span className="text-sm text-slate-400">{towers.size} / {TOWER_NAMES.length}</span>
        </h2>
        <ul className="mt-2 grid gap-2">
          {TOWER_NAMES.map((name, kind) => (
            <li key={name} data-testid={`defense-codex-tower-${kind}`} data-known={towers.has(kind) ? "true" : "false"} className="rounded-xl bg-slate-900/60 px-3 py-2 text-sm">
              {towers.has(kind) ? (
                <>
                  <span className="font-semibold text-white">{name}</span> <span className="text-slate-400">— {TOWER_ROLES[kind]}</span>
                </>
              ) : (
                <span className="text-slate-500">??? — 스테이지를 깨면 열려요</span>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-4" aria-labelledby="codex-enemies">
        <h2 id="codex-enemies" className="text-lg font-semibold text-white">
          적 <span className="text-sm text-slate-400">{met.size} / {ENEMY_NAMES.length}</span>
        </h2>
        <ul className="mt-2 grid gap-2">
          {ENEMY_NAMES.map((name, kind) => (
            <li key={name} data-testid={`defense-codex-enemy-${kind}`} data-known={met.has(kind) ? "true" : "false"} className="rounded-xl bg-slate-900/60 px-3 py-2 text-sm">
              {met.has(kind) ? (
                <>
                  <span className="font-semibold text-white">{name}</span> <span className="text-slate-400">— {ENEMY_TRAITS[kind]}</span>
                </>
              ) : (
                <span className="text-slate-500">??? — 아직 만나지 않았어요</span>
              )}
            </li>
          ))}
        </ul>
      </section>
      {briefings.length > 0 && (
        <section className="grid gap-2" aria-labelledby="codex-briefings">
          <h2 id="codex-briefings" className="text-lg font-semibold text-white">
            브리핑 다시 보기
          </h2>
          {briefings.map((b) => (
            <BriefingCard key={b.stageId} briefing={b} />
          ))}
        </section>
      )}
    </div>
  );
}
