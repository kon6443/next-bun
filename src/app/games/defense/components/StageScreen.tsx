"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DIFFICULTIES, type StageMeta, playPath } from "../lib/campaign";
import { DIFFICULTY_NAMES, TOWER_NAMES } from "../lib/labels";
import { type Progress, emptyProgress, isDifficultyUnlocked, isStageUnlocked, loadProgress } from "../lib/progress";

/**
 * 스테이지 화면 (defense DESIGN §F1) — 난이도 선택(쉬움·보통·어려움, 어려움은 보통 클리어 후 §L5) · 이 판 정보
 * 브리핑 카드·튜토리얼은 F1b
 */
const DIFFICULTY_NOTE = { easy: "적 체력 −20% · 타워 −15%", normal: "기준 난이도", hard: "적 체력 +20% · 타워 +8%" } as const;

export function StageScreen({ stage }: { stage: StageMeta }) {
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setProgress(loadProgress());
    setLoaded(true);
  }, []);

  const unlocked = isStageUnlocked(progress, stage.id);
  return (
    <div className="grid gap-4">
      <section className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-4">
        <h1 className="text-2xl font-bold text-white">스테이지 {stage.number}</h1>
        <p className="mt-1 text-sm text-slate-300">{stage.intro}</p>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-slate-900/60 p-2">
            <dt className="text-slate-400">웨이브</dt>
            <dd className="mt-0.5 text-base font-semibold text-white">{stage.waves}</dd>
          </div>
          <div className="rounded-lg bg-slate-900/60 p-2">
            <dt className="text-slate-400">시작 골드</dt>
            <dd className="mt-0.5 text-base font-semibold text-white">{stage.startGold}</dd>
          </div>
          <div className="rounded-lg bg-slate-900/60 p-2">
            <dt className="text-slate-400">업그레이드</dt>
            <dd className="mt-0.5 text-base font-semibold text-white">Lv{stage.maxLevel}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-slate-400">쓸 수 있는 타워: {stage.towers.map((t) => TOWER_NAMES[t]).join(" · ")}</p>
      </section>

      {loaded && !unlocked ? (
        <p className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">앞 스테이지를 깨면 열려요.</p>
      ) : (
        <section aria-label="난이도" className="grid gap-2">
          {DIFFICULTIES.map((difficulty) => {
            const open = loaded && isDifficultyUnlocked(progress, stage.id, difficulty);
            const stars = progress.stars[stage.id]?.[difficulty] ?? 0;
            const inner = (
              <>
                <span className="flex-1 text-left">
                  <span className="block font-semibold">{DIFFICULTY_NAMES[difficulty]}</span>
                  <span className="block text-xs opacity-80">{open || !loaded ? DIFFICULTY_NOTE[difficulty] : "보통을 깨면 열려요"}</span>
                </span>
                <span aria-label={`별 ${stars}개`} className="text-sm tracking-wider">
                  <span className="text-amber-300">{"★".repeat(stars)}</span>
                  <span className="opacity-40">{"★".repeat(3 - stars)}</span>
                </span>
              </>
            );
            return open ? (
              <Link
                key={difficulty}
                href={playPath(stage.id, difficulty)}
                data-testid={`defense-difficulty-${difficulty}`}
                className={`flex min-h-14 items-center gap-3 rounded-2xl px-4 text-white ${
                  difficulty === "normal" ? "bg-gradient-to-r from-indigo-500 to-sky-500 shadow-lg shadow-sky-500/30" : "border border-white/20 bg-slate-800/50"
                }`}
              >
                {inner}
              </Link>
            ) : (
              <div
                key={difficulty}
                data-testid={`defense-difficulty-${difficulty}`}
                aria-disabled="true"
                className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 text-slate-500"
              >
                {inner}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
