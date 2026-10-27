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
  /** 로그인 토큰 — 있으면 내 기록에 isMine이 붙는다 */
  accessToken?: string;
  /** 로그인 상태가 정해졌는지 — 정해지기 전에는 부르지 않는다(익명·토큰으로 두 번 부르지 않게) */
  ready?: boolean;
  /** 카드·제목 없이 목록만(테트리스 홈 기록 탭 안) — 불러오지 못하면 숨기지 않고 안내 문구 */
  bare?: boolean;
};

/**
 * 게임 홈 "오늘 많이 본 리플레이" — 오늘(daily) 조회수순 상위 몇 개, ▶로 바로 재생
 * 불러오지 못하면 섹션을 통째로 숨긴다 — 홈의 부가 영역이고, 백엔드 배포 전(엔드포인트 없음)에도 홈이 깨져 보이지 않게
 */
export function PopularReplaysPreview<G extends GameType>({ game, myScoreIds, limit = 5, accessToken, ready = true, bare = false }: Props<G>) {
  const [items, setItems] = useState<PopularReplayItem<ScoreDetailByGame[G]>[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    getPopularReplays(game.gameType, { period: "daily", sort: "views", limit }, accessToken)
      .then(({ data }) => !cancelled && setItems(data.items))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [game.gameType, limit, accessToken, ready]);

  const list =
    items === null ? (
      <LoadingSpinnerSimple message="리플레이를 불러오는 중..." />
    ) : items.length === 0 ? (
      <EmptyState message="오늘은 아직 본 리플레이가 없어요." description="랭킹에서 ▶를 눌러 다시보기를 볼 수 있어요." variant="minimal" />
    ) : (
      <RankingTable game={game} items={items} stat={(item) => formatViewCount(item.periodViewCount)} popular myScoreIds={myScoreIds} />
    );
  if (bare) {
    return (
      <div data-testid="popular-replays">
        {failed ? <p className="text-sm text-slate-400">리플레이를 불러오지 못했어요.</p> : list}
      </div>
    );
  }
  if (failed) return null;
  return (
    <section className={`${cardStyles.section} p-4`} aria-labelledby="popular-replays-title" data-testid="popular-replays">
      <h2 id="popular-replays-title" className="mb-3 text-base font-semibold text-white">
        오늘 많이 본 리플레이
      </h2>
      {list}
    </section>
  );
}
