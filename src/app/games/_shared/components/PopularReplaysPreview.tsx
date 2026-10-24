"use client";

import { useEffect, useState } from "react";
import { EmptyState, LoadingSpinnerSimple } from "@/app/teams/components";
import { cardStyles } from "@/styles/teams";
import { getPopularReplays } from "@/services/gameService";
import type { GameType, PopularReplayItem, ScoreDetailByGame } from "@/types/game";
import { formatViewCount } from "../lib/format";
import type { GameUiConfig } from "../lib/gameConfig";
import { RankingTable } from "./RankingTable";

type Props<G extends GameType> = {
  game: GameUiConfig<G>;
  myScoreIds: ReadonlySet<number>;
  limit?: number;
};

/**
 * 게임 홈 "오늘 많이 본 리플레이" — 오늘(daily) 조회수순 상위 몇 개, ▶로 바로 재생
 * 불러오지 못하면 섹션을 통째로 숨긴다 — 홈의 부가 영역이고, 백엔드 배포 전(엔드포인트 없음)에도 홈이 깨져 보이지 않게
 */
export function PopularReplaysPreview<G extends GameType>({ game, myScoreIds, limit = 5 }: Props<G>) {
  const [items, setItems] = useState<PopularReplayItem<ScoreDetailByGame[G]>[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getPopularReplays(game.gameType, { period: "daily", sort: "views", limit })
      .then(({ data }) => !cancelled && setItems(data.items))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [game.gameType, limit]);

  if (failed) return null;
  return (
    <section className={`${cardStyles.section} p-4`} data-testid="popular-replays">
      <h2 className="mb-3 text-base font-semibold text-white">오늘 많이 본 리플레이</h2>
      {items === null ? (
        <LoadingSpinnerSimple message="리플레이를 불러오는 중..." />
      ) : items.length === 0 ? (
        <EmptyState message="오늘은 아직 본 리플레이가 없어요." description="랭킹에서 ▶를 눌러 다시보기를 볼 수 있어요." variant="minimal" />
      ) : (
        <RankingTable game={game} items={items} stat={(item) => formatViewCount(item.periodViewCount)} popular myScoreIds={myScoreIds} />
      )}
    </section>
  );
}
