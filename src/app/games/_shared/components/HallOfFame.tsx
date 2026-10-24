"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cardStyles } from "@/styles/teams";
import { getHallOfFame } from "@/services/gameService";
import type { GameType, HallOfFamePeriod, ScoreDetailByGame } from "@/types/game";
import { formatScore } from "../lib/format";
import type { GameUiConfig } from "../lib/gameConfig";

type Props<G extends GameType> = {
  game: GameUiConfig<G>;
  /**
   * 기간 종류별 리플레이 공개 지연(그 기간 끝 기준, ms) — 그 전엔 서버가 404라 ▶를 끈다
   * 테트리스 데일리 2시간, 디펜스 주간 4시간(세션 TTL), 테트리스 기본 보드 주간은 0
   */
  replayDelayMs?: Partial<Record<HallOfFamePeriod["kind"], number>>;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MEDALS = ["🥇", "🥈", "🥉"];

/** ISO(UTC) → KST "10/24" */
function kstMonthDay(ms: number): string {
  const date = new Date(ms + KST_OFFSET_MS);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

/** "10/20 ~ 10/26 주간" · "10/24 데일리" — 끝은 그 기간 마지막 날(끝 시각 직전) */
export function hallOfFamePeriodLabel(period: Pick<HallOfFamePeriod, "kind" | "startsAt" | "endsAt">): string {
  const start = Date.parse(period.startsAt);
  if (period.kind === "daily") return `${kstMonthDay(start)} 데일리`;
  return `${kstMonthDay(start)} ~ ${kstMonthDay(Date.parse(period.endsAt) - 1)} 주간`;
}

/**
 * 명예의 전당 (games-growth B5) — 지난 기간별 1~3위 카드와 ▶ 리플레이
 * 못 받았거나 비었으면 섹션을 숨긴다(랭킹 화면의 부가 영역)
 */
export function HallOfFame<G extends GameType>({ game, replayDelayMs = {} }: Props<G>) {
  const [periods, setPeriods] = useState<HallOfFamePeriod<ScoreDetailByGame[G]>[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    getHallOfFame(game.gameType)
      .then(({ data }) => !cancelled && setPeriods(data.periods))
      .catch(() => !cancelled && setPeriods([]));
    return () => {
      cancelled = true;
    };
  }, [game.gameType]);

  if (!periods || periods.length === 0) return null;
  const now = Date.now();
  return (
    <section className={`${cardStyles.section} p-4`} aria-labelledby="hall-of-fame-title" data-testid="hall-of-fame">
      <h2 id="hall-of-fame-title" className="text-base font-semibold text-white">
        🏆 명예의 전당
      </h2>
      <ul className="mt-3 grid gap-3">
        {periods.map((period) => {
          const label = hallOfFamePeriodLabel(period);
          const replayOpen = now >= Date.parse(period.endsAt) + (replayDelayMs[period.kind] ?? 0);
          return (
            <li key={period.boardKey} className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
              <h3 className="text-xs font-semibold text-slate-400">{label}</h3>
              <ol className="mt-2 grid gap-1.5">
                {period.podium.map((item) => (
                  <li key={item.scoreId} className="flex items-center gap-2 text-sm">
                    <span aria-hidden="true" className="w-6 text-center">
                      {MEDALS[item.rank - 1] ?? item.rank}
                    </span>
                    <span className="sr-only">{item.rank}위</span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-white">{item.playerName}</span>
                    <span className="shrink-0 tabular-nums text-slate-200">{(game.formatScore ?? formatScore)(item.score)}</span>
                    {replayOpen ? (
                      <Link
                        href={game.replayPath(item.scoreId)}
                        aria-label={`${label} ${item.rank}위 ${item.playerName} 리플레이 보기`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 text-slate-200 hover:border-sky-400/60"
                      >
                        ▶
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        aria-label={`${label} ${item.rank}위 ${item.playerName} 리플레이 — 곧 공개돼요`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 text-slate-600"
                      >
                        ▶
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
