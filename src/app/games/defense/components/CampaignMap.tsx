"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CAMPAIGN, stagePath } from "../lib/campaign";
import { type Progress, bestStars, emptyProgress, isStageUnlocked, loadProgress } from "../lib/progress";

/**
 * 캠페인 지도 (defense DESIGN §F1, F1a 최소) — 스테이지 8개 노드 · 별 0~3 · 잠김
 * 진행은 기기 저장(localStorage) — 서버 렌더에서는 빈 진행(S1만 열림)으로 그리고 마운트 뒤 실제 값으로 바꾼다
 */
export function CampaignMap() {
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  useEffect(() => setProgress(loadProgress()), []);

  return (
    <ol className="grid gap-3" aria-label="캠페인 스테이지">
      {CAMPAIGN.map((stage) => {
        const unlocked = isStageUnlocked(progress, stage.id);
        const stars = bestStars(progress, stage.id);
        const body = (
          <>
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
                unlocked ? "bg-gradient-to-br from-amber-400 to-rose-500 text-slate-950" : "bg-slate-800 text-slate-500"
              }`}
              aria-hidden="true"
            >
              {unlocked ? stage.number : "🔒"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-white">스테이지 {stage.number}</span>
              <span className="block truncate text-xs text-slate-400">{unlocked ? stage.intro : "앞 스테이지를 깨면 열려요"}</span>
            </span>
            <span className="text-sm tracking-wider" role="img" aria-label={`별 ${stars}개`}>
              <span className="text-amber-300">{"★".repeat(stars)}</span>
              <span className="text-slate-600">{"★".repeat(3 - stars)}</span>
            </span>
          </>
        );
        return (
          <li key={stage.id}>
            {unlocked ? (
              <Link
                href={stagePath(stage.id)}
                data-testid={`defense-stage-${stage.id}`}
                data-locked="false"
                data-stars={stars}
                className="flex min-h-16 items-center gap-3 rounded-2xl border border-slate-700/50 bg-slate-800/50 p-3 hover:border-white/30"
              >
                {body}
              </Link>
            ) : (
              <div
                data-testid={`defense-stage-${stage.id}`}
                data-locked="true"
                data-stars={0}
                aria-disabled="true"
                className="flex min-h-16 items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 opacity-70"
              >
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
