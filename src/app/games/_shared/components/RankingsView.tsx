"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { TeamsPageLayout, ButtonLink, Button, SectionLabel, EmptyState, TeamListSkeleton } from "@/app/teams/components";
import { cardStyles } from "@/styles/teams";
import { getGameRankings, getGameScore, getPopularReplays } from "@/services/gameService";
import type { GameType, PopularReplayList, PopularSort, RankingList, RankingPeriod, ScoreDetailByGame } from "@/types/game";
import { extractErrorMessage } from "@/app/utils/errorUtils";
import { formatFullDateTime } from "@/app/utils/taskUtils";
import { formatViewCount, formatWatchTime } from "../lib/format";
import type { GameUiConfig } from "../lib/gameConfig";
import { RankingTable } from "./RankingTable";

const PERIODS: { key: RankingPeriod; label: string }[] = [
  { key: "daily", label: "일간" },
  { key: "weekly", label: "주간" },
  { key: "all", label: "전체" },
];
/** 점수순 = 랭킹, 조회순·시청순 = 인기 리플레이(기간 조회수·시청 시간) */
type SortKey = "score" | PopularSort;
const SORTS: { key: SortKey; label: string }[] = [
  { key: "score", label: "점수순" },
  { key: "views", label: "조회순" },
  { key: "watch", label: "시청순" },
];
const LIMIT = 50;

/** 받은 목록과 그 정렬 — 정렬을 바꾼 직후 렌더에서 이전 목록에 새 정렬의 지표를 붙이지 않게 함께 둔다 */
type Listing<D> = { sort: "score"; data: RankingList<D> } | { sort: PopularSort; data: PopularReplayList<D> };

type RankingsViewProps<G extends GameType> = {
  game: GameUiConfig<G>;
  /** 링크로 가리킨 기록 (?highlight=) */
  highlightId: number | null;
  /** 보드 키 — 없으면 그 게임의 기본 보드 */
  board?: string;
  /** 기간 탭 — 보드 자체가 기간인 경우(주간 도전)는 숨기고 전체 기간으로 부른다 */
  showPeriods?: boolean;
  /** 제목 아래 게임별 영역(보드 탭 등) */
  header?: ReactNode;
  /** 리플레이를 볼 수 없으면 그 이유 (RankingTable) */
  replayUnavailable?: string | null;
  /** 빈 목록의 "게임 시작" 링크 — 없으면 game.playPath */
  playHref?: string;
  /** 어느 보드를 볼지 정하는 중(디펜스 /boards 응답 전) — 같은 화면 틀에 skeleton만, 랭킹은 아직 부르지 않는다 */
  waiting?: boolean;
  /** 목록 아래 게임별 영역(명예의 전당 등) */
  footer?: ReactNode;
};

/** 게임 랭킹 화면 — 기간 탭 × 정렬(점수·조회·시청) + 상위 50개 (게임별 page는 클라이언트 래퍼에서 game 사양을 넘긴다) */
export function RankingsView<G extends GameType>({ game, highlightId, board, showPeriods = true, header, replayUnavailable = null, playHref, waiting = false, footer }: RankingsViewProps<G>) {
  const [selectedPeriod, setPeriod] = useState<RankingPeriod>("daily");
  const period: RankingPeriod = showPeriods ? selectedPeriod : "all";
  const [sort, setSort] = useState<SortKey>("score");
  const [listing, setListing] = useState<Listing<ScoreDetailByGame[G]> | null>(null);
  const list = listing?.data ?? null;
  const [error, setError] = useState<string | null>(null);
  const [myScoreIds, setMyScoreIds] = useState<ReadonlySet<number>>(new Set());
  const requestIdRef = useRef(0);

  const { storage } = game;
  useEffect(() => {
    setMyScoreIds(new Set(storage.loadMyScoreIds()));
  }, [storage]);

  const load = useCallback(async (target: RankingPeriod, targetSort: SortKey) => {
    // 탭을 빠르게 바꾸면 늦게 온 이전 탭 응답은 버린다
    const requestId = ++requestIdRef.current;
    setListing(null);
    setError(null);
    try {
      const next: Listing<ScoreDetailByGame[G]> =
        targetSort === "score"
          ? { sort: "score", data: (await getGameRankings(game.gameType, target, LIMIT, board)).data }
          : { sort: targetSort, data: (await getPopularReplays(game.gameType, { period: target, sort: targetSort, limit: LIMIT, board })).data };
      if (requestId === requestIdRef.current) setListing(next);
    } catch (err) {
      if (requestId === requestIdRef.current) setError(extractErrorMessage(err, "랭킹을 불러오지 못했습니다."));
    }
  }, [game.gameType, board]);

  /**
   * 링크로 가리킨 기록이 이 목록(상위 50)에 없으면 그 기록의 전체 기간 순위를 한 번 받아 알린다 — 강조할 행이 없어 아무 표시가 없던 것 (games-polish FE-14)
   * null = 아직 모름(목록에 있거나 받는 중), "unknown" = 받지 못함
   */
  const [outside, setOutside] = useState<{ rank: number } | "unknown" | null>(null);
  // 인기 목록의 순서는 점수 순위가 아니다 — "상위 50위 밖" 안내는 점수순에서만
  const missing = listing?.sort === "score" && highlightId !== null && !listing.data.items.some((item) => item.scoreId === highlightId);
  useEffect(() => {
    if (!missing || highlightId === null) {
      setOutside(null);
      return;
    }
    let cancelled = false;
    getGameScore(game.gameType, highlightId)
      .then(({ data }) => !cancelled && setOutside({ rank: data.rank }))
      .catch(() => !cancelled && setOutside("unknown"));
    return () => {
      cancelled = true;
    };
  }, [missing, highlightId, game.gameType]);

  useEffect(() => {
    if (waiting) return;
    load(period, sort);
  }, [load, period, sort, waiting]);

  return (
    <TeamsPageLayout>
      <section className={`${cardStyles.section} p-5`}>
        <div className="flex items-center justify-between">
          <SectionLabel spacing="wide">Ranking</SectionLabel>
          <ButtonLink href={game.homePath} variant="secondary" size="md">
            ← {game.name}
          </ButtonLink>
        </div>
        <h1 className="mt-4 text-2xl font-bold text-white">{game.name} 랭킹</h1>
        {header}
        {/* 기간 선택 — 탭 패턴(화살표 이동·패널 연결) 대신 토글 버튼 그룹 */}
        {showPeriods && (
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
        )}
        {/* 리플레이를 아직 볼 수 없는 보드(진행 중인 주간 도전)는 본 기록도 없다 — 정렬을 숨긴다 */}
        {!replayUnavailable && (
          <div role="group" aria-label="랭킹 정렬" className="mt-2 grid grid-cols-3 gap-1 rounded-full border border-white/10 bg-slate-950/40 p-1">
            {SORTS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-pressed={sort === key}
                onClick={() => setSort(key)}
                className={`min-h-11 rounded-full text-sm font-semibold transition ${
                  sort === key ? "bg-sky-500/30 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {list?.periodStart && period !== "all" && (
          <p className="mt-3 text-xs text-slate-500">
            {formatFullDateTime(new Date(list.periodStart))}
            {listing?.sort === "score" ? "부터의 기록" : listing?.sort === "views" ? "부터 본 횟수" : "부터 본 시간"}
          </p>
        )}
      </section>

      <section className={`${cardStyles.section} p-4`} aria-busy={list === null && !error}>
        {error ? (
          <div className={`${cardStyles.errorDashedContainer} px-6 py-10 text-center`} role="alert">
            <p className="text-sm font-semibold text-red-300">{error}</p>
            <Button variant="secondary" size="sm" className="mt-4 min-h-11" onClick={() => load(period, sort)}>
              다시 시도
            </Button>
          </div>
        ) : listing === null ? (
          <TeamListSkeleton cardCount={3} />
        ) : listing.sort !== "score" && listing.data.items.length === 0 ? (
          <EmptyState
            message={showPeriods ? "이 기간에 본 리플레이가 아직 없어요." : "아직 본 리플레이가 없어요."}
            description="점수순 목록에서 ▶를 눌러 다시보기를 볼 수 있어요."
          />
        ) : listing.data.items.length === 0 ? (
          <EmptyState
            message="아직 기록이 없어요."
            description="첫 번째 기록의 주인공이 되어 보세요!"
            action={
              <ButtonLink href={playHref ?? game.playPath} size="md" className="mt-6">
                게임 시작
              </ButtonLink>
            }
          />
        ) : (
          <>
            {missing && (
              <p role="status" className="mb-3 rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100" data-testid="ranking-outside">
                {outside && outside !== "unknown"
                  ? `가리킨 기록은 이 목록(상위 ${LIMIT}위)에 없어요 · 전체 기간 ${outside.rank}위`
                  : `가리킨 기록은 이 목록(상위 ${LIMIT}위)에 없어요.`}
              </p>
            )}
            {listing.sort === "score" ? (
              <RankingTable game={game} items={listing.data.items} myScoreIds={myScoreIds} highlightId={highlightId} replayUnavailable={replayUnavailable} />
            ) : (
              <RankingTable
                game={game}
                items={listing.data.items}
                popular
                stat={listing.sort === "views" ? (item) => formatViewCount(item.periodViewCount) : (item) => formatWatchTime(item.periodWatchMs)}
                myScoreIds={myScoreIds}
                highlightId={highlightId}
                replayUnavailable={replayUnavailable}
              />
            )}
          </>
        )}
      </section>
      {footer}
    </TeamsPageLayout>
  );
}
