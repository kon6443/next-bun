import { useEffect, useRef } from "react";
import Link from "next/link";
import type { GameType, RankingItem, ScoreDetailByGame } from "@/types/game";
import { formatFullDateTime } from "@/app/utils/taskUtils";
import { formatScore, formatViewCount } from "../lib/format";
import type { GameUiConfig } from "../lib/gameConfig";
import { TrophyBadge } from "./TrophyBadge";

type RankingTableProps<G extends GameType, I extends RankingItem<ScoreDetailByGame[G]>> = {
  game: GameUiConfig<G>;
  items: I[];
  /** 보조줄 끝 지표 — 기본은 누적 조회수(인기 목록은 기간 조회수·시청 시간) */
  stat?: (item: I) => string;
  /** 인기 목록 — rank가 점수 순위가 아니라 인기 순서라 읽는 이름을 바꾼다 */
  popular?: boolean;
  /** 이 브라우저에서 등록한 기록 — "나" 배지. 서버가 알려 준 내 기록(item.isMine, 로그인 계정 기준)과 합친다 — 비로그인으로 이 브라우저에서 낸 기록도 "나" */
  myScoreIds: ReadonlySet<number>;
  /** 링크로 가리킨 기록 (?highlight=) — 테두리 강조만, "나"로 단정하지 않는다 */
  highlightId?: number | null;
  compact?: boolean;
  /** 리플레이를 볼 수 없으면 그 이유 — 링크 대신 비활성 버튼(재생기 준비 전·진행 중인 주간 보드) */
  replayUnavailable?: string | null;
};

const medal = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null);

/** 랭킹 목록 — 좁은 화면에서도 가로 스크롤 없이 카드형 행 */
const defaultStat = (item: RankingItem<unknown>) => formatViewCount(item.viewCount);

export function RankingTable<G extends GameType, I extends RankingItem<ScoreDetailByGame[G]>>({
  game,
  items,
  stat = defaultStat,
  popular = false,
  myScoreIds,
  highlightId = null,
  compact = false,
  replayUnavailable = null,
}: RankingTableProps<G, I>) {
  // 링크로 가리킨 기록이 목록에 있으면 화면 가운데로 — 모바일에서 50위 목록 아래쪽이면 보이지 않았다 (games-polish FE-14)
  const highlightRef = useRef<HTMLLIElement>(null);
  const highlightShown = highlightId !== null && items.some((item) => item.scoreId === highlightId);
  useEffect(() => {
    if (highlightShown) highlightRef.current?.scrollIntoView?.({ block: "center" });
  }, [highlightShown]);
  return (
    <ol className="grid grid-cols-1 gap-2">
      {items.map((item) => {
        const rankLabel = popular ? `인기 ${item.rank}번째` : `${item.rank}위`;
        const mine = item.isMine === true || myScoreIds.has(item.scoreId);
        const highlighted = item.scoreId === highlightId;
        return (
          <li
            key={item.scoreId}
            ref={highlighted ? highlightRef : undefined}
            aria-current={highlighted ? "true" : undefined}
            className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${
              highlighted
                ? "border-amber-300/70 bg-amber-400/10"
                : mine
                  ? "border-sky-400/50 bg-sky-500/10"
                  : "border-white/10 bg-slate-950/40"
            }`}
          >
            <span className="w-9 shrink-0 text-center text-base font-bold tabular-nums text-slate-300">
              {/* 인기 목록은 순서 숫자만 — 메달은 점수 순위로 읽힌다 */}
              {popular ? item.rank : (medal(item.rank) ?? item.rank)}
            </span>
            <div className="min-w-0 flex-1">
              {/* 이름만 말줄임 — 배지·"나"는 긴 이름에도 남긴다 */}
              <p className="flex min-w-0 items-center text-sm font-semibold text-white">
                <span className="truncate">{item.playerName}</span>
                <TrophyBadge trophies={item.trophies} />
                {mine && <span className="ml-1.5 shrink-0 rounded-full bg-sky-500/30 px-1.5 py-0.5 text-[10px] text-sky-100">나</span>}
              </p>
              {!compact && (
                // 지표는 줄이 잘려도 보이게 — 요약·날짜만 말줄임
                <p className="mt-0.5 flex min-w-0 gap-1 text-xs text-slate-500">
                  <span className="truncate">
                    {game.rankingDetail(item)} · {formatFullDateTime(new Date(item.createdAt))}
                  </span>
                  <span className="shrink-0">· {stat(item)}</span>
                </p>
              )}
            </div>
            <span className="shrink-0 text-sm font-bold tabular-nums text-white">{(game.formatScore ?? formatScore)(item.score)}</span>
            {!compact && replayUnavailable && (
              <button
                type="button"
                disabled
                aria-label={`${item.playerName} ${rankLabel} 리플레이 — ${replayUnavailable}`}
                title={replayUnavailable}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 text-sm text-slate-600"
              >
                ▶
              </button>
            )}
            {!compact && !replayUnavailable && (
              <Link
                href={game.replayPath(item.scoreId)}
                aria-label={`${item.playerName} ${rankLabel} 리플레이 보기`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 text-sm text-slate-200 hover:border-sky-400/60"
              >
                ▶
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
