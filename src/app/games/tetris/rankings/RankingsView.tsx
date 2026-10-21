"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TeamsPageLayout, ButtonLink, Button, SectionLabel, EmptyState, TeamListSkeleton } from "@/app/teams/components";
import { cardStyles } from "@/styles/teams";
import { getGameRankings } from "@/services/gameService";
import type { RankingList, RankingPeriod } from "@/types/game";
import { extractErrorMessage } from "@/app/utils/errorUtils";
import { formatFullDateTime } from "@/app/utils/taskUtils";
import { RankingTable } from "../components/RankingTable";
import { loadMyScoreIds } from "../lib/storage";

const PERIODS: { key: RankingPeriod; label: string }[] = [
  { key: "daily", label: "일간" },
  { key: "weekly", label: "주간" },
  { key: "all", label: "전체" },
];
const LIMIT = 50;

export default function RankingsView({ highlightId }: { highlightId: number | null }) {
  const [period, setPeriod] = useState<RankingPeriod>("daily");
  const [list, setList] = useState<RankingList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myScoreIds, setMyScoreIds] = useState<ReadonlySet<number>>(new Set());
  const requestIdRef = useRef(0);

  useEffect(() => {
    setMyScoreIds(new Set(loadMyScoreIds()));
  }, []);

  const load = useCallback(async (target: RankingPeriod) => {
    // 탭을 빠르게 바꾸면 늦게 온 이전 탭 응답은 버린다
    const requestId = ++requestIdRef.current;
    setList(null);
    setError(null);
    try {
      const { data } = await getGameRankings("tetris", target, LIMIT);
      if (requestId === requestIdRef.current) setList(data);
    } catch (err) {
      if (requestId === requestIdRef.current) setError(extractErrorMessage(err, "랭킹을 불러오지 못했습니다."));
    }
  }, []);

  useEffect(() => {
    load(period);
  }, [load, period]);

  return (
    <TeamsPageLayout>
      <section className={`${cardStyles.section} p-5`}>
        <div className="flex items-center justify-between">
          <SectionLabel spacing="wide">Ranking</SectionLabel>
          <ButtonLink href="/games/tetris" variant="secondary" size="md">
            ← 테트리스
          </ButtonLink>
        </div>
        <h1 className="mt-4 text-2xl font-bold text-white">테트리스 랭킹</h1>
        {/* 기간 선택 — 탭 패턴(화살표 이동·패널 연결) 대신 토글 버튼 그룹 */}
        <div role="group" aria-label="랭킹 기간" className="mt-4 grid grid-cols-3 gap-1 rounded-full border border-white/10 bg-slate-950/40 p-1">
          {PERIODS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={period === key}
              onClick={() => setPeriod(key)}
              className={`min-h-11 rounded-full text-sm font-semibold transition ${
                period === key ? "bg-sky-500/30 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {list?.periodStart && period !== "all" && (
          <p className="mt-3 text-xs text-slate-500">{formatFullDateTime(new Date(list.periodStart))}부터의 기록</p>
        )}
      </section>

      <section className={`${cardStyles.section} p-4`} aria-busy={list === null && !error}>
        {error ? (
          <div className={`${cardStyles.errorDashedContainer} px-6 py-10 text-center`} role="alert">
            <p className="text-sm font-semibold text-red-300">{error}</p>
            <Button variant="secondary" size="sm" className="mt-4 min-h-11" onClick={() => load(period)}>
              다시 시도
            </Button>
          </div>
        ) : list === null ? (
          <TeamListSkeleton cardCount={3} />
        ) : list.items.length === 0 ? (
          <EmptyState
            message="아직 기록이 없어요."
            description="첫 번째 기록의 주인공이 되어 보세요!"
            action={
              <ButtonLink href="/games/tetris/play" size="md" className="mt-6">
                게임 시작
              </ButtonLink>
            }
          />
        ) : (
          <RankingTable items={list.items} myScoreIds={myScoreIds} highlightId={highlightId} />
        )}
      </section>
    </TeamsPageLayout>
  );
}
