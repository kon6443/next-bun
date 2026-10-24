"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getGameBoards } from "@/services/gameService";
import type { GameBoard } from "@/types/game";
import { formatDefenseScore, loadBests } from "../lib/defenseGame";
import { isRankedUnlocked, loadProgress } from "../lib/progress";
import { boardShortTitle, currentEndlessBoardKey } from "../lib/rankedBoards";

/**
 * 허브의 무한·주간 카드 (defense DESIGN §F1·§L7) — 스테이지 4를 깨면 열린다. 랭킹 보기는 누구나
 * 주간: 이번 주 보드(W43)·남은 시간 — /boards에 이번 주가 없으면(서버 설정) 시작을 막는다. 규칙은 세션 seed로 정해져 시작한 뒤 보인다
 */

function remainingText(endsAt: string, now: number): string {
  const left = Date.parse(endsAt) - now;
  if (!Number.isFinite(left) || left <= 0) return "곧 끝나요";
  const hours = Math.floor(left / 3_600_000);
  return hours >= 24 ? `${Math.floor(hours / 24)}일 ${hours % 24}시간 남음` : `${Math.max(1, hours)}시간 남음`;
}

export function RankedCards() {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [bests, setBests] = useState<Record<string, number>>({});
  const [boards, setBoards] = useState<GameBoard[] | null>(null);
  const [boardsFailed, setBoardsFailed] = useState(false);
  useEffect(() => {
    setUnlocked(isRankedUnlocked(loadProgress()));
    setBests(loadBests());
    getGameBoards("defense")
      .then(({ data }) => setBoards(data.items))
      .catch(() => setBoardsFailed(true));
  }, []);

  const weekly = boards?.find((b) => b.mode === "weekly" && b.current) ?? null;
  // 최고 기록은 세션의 보드 키(시즌)로 쌓인다 — 시즌이 바뀌면 새 시즌 것을 보인다 (FE-07)
  const endlessKey = currentEndlessBoardKey(boards);
  const endlessBest = bests[endlessKey] ?? 0;
  const weeklyBest = weekly ? (bests[weekly.boardKey] ?? 0) : 0;
  // 보드 목록을 못 받아도 주간을 막지 않는다 — 세션 발급에서 다시 판정(실패면 로컬 판)
  const weeklyOpen = boards === null && !boardsFailed ? null : weekly !== null || boardsFailed;

  return (
    <section className="grid gap-3 sm:grid-cols-2" aria-label="무한 모드·주간 도전" data-testid="defense-ranked-cards">
      <article className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-4">
        <h2 className="text-lg font-semibold text-white">무한 모드</h2>
        <p className="mt-1 text-xs text-slate-400">{boardShortTitle(endlessKey)} · 5웨이브마다 증강</p>
        <p className="mt-2 text-sm text-slate-300">내 최고 {endlessBest > 0 ? formatDefenseScore(endlessBest) : "—"}</p>
        <RankedActions unlocked={unlocked} playHref="/games/defense/play/endless" rankingsHref={`/games/defense/rankings?board=${endlessKey}`} testId="endless" open />
      </article>
      <article className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-4">
        <h2 className="text-lg font-semibold text-white">주간 도전</h2>
        <p className="mt-1 text-xs text-slate-400">
          {weekly ? [boardShortTitle(weekly.boardKey), weekly.endsAt ? remainingText(weekly.endsAt, Date.now()) : null].filter(Boolean).join(" · ") : boards ? "이번 주 도전을 열 수 없어요" : "모두 같은 맵·규칙"}
        </p>
        <p className="mt-2 text-sm text-slate-300">내 최고 {weeklyBest > 0 ? formatDefenseScore(weeklyBest) : "—"}</p>
        <RankedActions unlocked={unlocked} playHref="/games/defense/play/weekly" rankingsHref="/games/defense/rankings?board=weekly" testId="weekly" open={weeklyOpen} />
      </article>
    </section>
  );
}

/** open: null = 보드 목록 확인 중 */
function RankedActions({ unlocked, playHref, rankingsHref, testId, open }: { unlocked: boolean | null; playHref: string; rankingsHref: string; testId: string; open: boolean | null }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {unlocked && open ? (
        <Link href={playHref} data-testid={`defense-${testId}-play`} className="flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 text-sm font-semibold text-white">
          시작
        </Link>
      ) : (
        <span aria-disabled="true" data-testid={`defense-${testId}-locked`} className="flex min-h-11 items-center justify-center rounded-full border border-white/10 px-2 text-center text-xs text-slate-400">
          {unlocked === false ? "🔒 스테이지 4를 깨면 열려요" : unlocked === null || open === null ? "…" : "지금은 열 수 없어요"}
        </span>
      )}
      <Link href={rankingsHref} data-testid={`defense-${testId}-rankings`} className="flex min-h-11 items-center justify-center rounded-full border border-white/20 text-sm font-semibold text-slate-200">
        랭킹
      </Link>
    </div>
  );
}
