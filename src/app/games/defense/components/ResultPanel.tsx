"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { TICKS_PER_SECOND } from "../engine";
import type { PlayResult } from "../hooks/useDefensePlay";
import { ENEMY_NAMES } from "../lib/labels";

/**
 * 캠페인 결과 (defense DESIGN §F7) — 별·남은 목숨·시간 · 다시·다음
 * 패배면 실패 원인 요약(가장 많이 샌 적·웨이브, §F0-3). 다시보기 재생은 F3 — 여기서는 저장됐는지만 알린다
 */
type Props = {
  result: PlayResult;
  stars: number;
  replaySaved: boolean;
  /** 진행 저장 실패(사파리 비공개 모드 등) — 다음 스테이지가 열리지 않을 수 있음을 알린다 */
  progressSaved: boolean;
  nextHref: string | null;
  exitHref: string;
  onRetry: () => void;
};

function formatTicks(ticks: number): string {
  const total = Math.floor(ticks / TICKS_PER_SECOND);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function ResultPanel({ result, stars, replaySaved, progressSaved, nextHref, exitHref, onRetry }: Props) {
  const nextRef = useRef<HTMLAnchorElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  // 대화상자가 뜨면 첫 동작(다음, 없으면 다시)으로 포커스 — 키보드·스크린리더가 결과를 바로 만난다
  useEffect(() => (nextRef.current ?? retryRef.current)?.focus(), []);
  let worstEnemy = -1;
  result.leakedLivesByEnemy.forEach((lives, kind) => {
    if ((lives ?? 0) > (result.leakedLivesByEnemy[worstEnemy] ?? 0)) worstEnemy = kind;
  });
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="defense-result-title"
        data-testid="defense-result"
        data-victory={result.victory ? "true" : "false"}
        data-stars={stars}
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900 p-5 text-center shadow-2xl shadow-black/60"
      >
        <h2 id="defense-result-title" className="text-2xl font-bold text-white">
          {result.victory ? "승리!" : "패배"}
        </h2>
        {result.victory && (
          <p className="mt-2 text-3xl tracking-widest" aria-label={`별 ${stars}개`}>
            <span className="text-amber-300">{"★".repeat(stars)}</span>
            <span className="text-slate-600">{"★".repeat(3 - stars)}</span>
          </p>
        )}
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-slate-800/60 p-2">
            <dt className="text-xs text-slate-400">남은 목숨</dt>
            <dd className="font-semibold tabular-nums text-white">{result.livesLeft}</dd>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-2">
            <dt className="text-xs text-slate-400">시간</dt>
            <dd className="font-semibold tabular-nums text-white">{formatTicks(result.endTick)}</dd>
          </div>
        </dl>
        {!result.victory && (worstEnemy >= 0 || result.worstWave > 0) && (
          <p className="mt-3 text-sm text-slate-300" data-testid="defense-result-cause">
            {worstEnemy >= 0 && <>가장 많이 샌 적은 {ENEMY_NAMES[worstEnemy]}</>}
            {worstEnemy >= 0 && result.worstWave > 0 && ", "}
            {result.worstWave > 0 && <>웨이브 {result.worstWave}에서 가장 많이 샜어요</>}
          </p>
        )}
        {replaySaved && <p className="mt-2 text-xs text-slate-400">이 판을 다시보기로 저장했어요</p>}
        {!progressSaved && (
          <p className="mt-2 text-xs text-amber-300" role="alert">
            기기에 진행을 저장하지 못했어요(비공개 모드·저장 공간). 다음 스테이지가 열리지 않을 수 있어요.
          </p>
        )}
        <div className="mt-4 grid gap-2">
          {result.victory && nextHref && (
            <Link
              ref={nextRef}
              replace
              href={nextHref}
              data-testid="defense-next"
              className="flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 text-sm font-semibold text-white"
            >
              다음 스테이지
            </Link>
          )}
          <button
            ref={retryRef}
            type="button"
            data-testid="defense-retry"
            onClick={onRetry}
            className="min-h-11 rounded-full border border-white/20 text-sm font-semibold text-slate-100"
          >
            다시 하기
          </button>
          <Link replace href={exitHref} className="flex min-h-11 items-center justify-center text-sm text-slate-400">
            스테이지 화면으로
          </Link>
        </div>
      </section>
    </div>
  );
}
