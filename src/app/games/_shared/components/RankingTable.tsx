import Link from "next/link";
import type { GameType, RankingItem, ScoreDetailByGame } from "@/types/game";
import { formatFullDateTime } from "@/app/utils/taskUtils";
import { formatScore } from "../lib/format";
import type { GameUiConfig } from "../lib/gameConfig";

type RankingTableProps<G extends GameType> = {
  game: GameUiConfig<G>;
  items: RankingItem<ScoreDetailByGame[G]>[];
  /** 이 브라우저에서 등록한 기록 — "나" 배지 */
  myScoreIds: ReadonlySet<number>;
  /** 링크로 가리킨 기록 (?highlight=) — 테두리 강조만, "나"로 단정하지 않는다 */
  highlightId?: number | null;
  compact?: boolean;
  /** 리플레이를 볼 수 없으면 그 이유 — 링크 대신 비활성 버튼(재생기 준비 전·진행 중인 주간 보드) */
  replayUnavailable?: string | null;
};

const medal = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null);

/** 랭킹 목록 — 좁은 화면에서도 가로 스크롤 없이 카드형 행 */
export function RankingTable<G extends GameType>({ game, items, myScoreIds, highlightId = null, compact = false, replayUnavailable = null }: RankingTableProps<G>) {
  return (
    <ol className="grid gap-2">
      {items.map((item) => {
        const mine = myScoreIds.has(item.scoreId);
        const highlighted = item.scoreId === highlightId;
        return (
          <li
            key={item.scoreId}
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
              {medal(item.rank) ?? item.rank}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {item.playerName}
                {mine && <span className="ml-1.5 rounded-full bg-sky-500/30 px-1.5 py-0.5 text-[10px] text-sky-100">나</span>}
              </p>
              {!compact && (
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {game.rankingDetail(item)} · {formatFullDateTime(new Date(item.createdAt))}
                </p>
              )}
            </div>
            <span className="shrink-0 text-sm font-bold tabular-nums text-white">{(game.formatScore ?? formatScore)(item.score)}</span>
            {!compact && replayUnavailable && (
              <button
                type="button"
                disabled
                aria-label={`${item.playerName} ${item.rank}위 리플레이 — ${replayUnavailable}`}
                title={replayUnavailable}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 text-sm text-slate-600"
              >
                ▶
              </button>
            )}
            {!compact && !replayUnavailable && (
              <Link
                href={game.replayPath(item.scoreId)}
                aria-label={`${item.playerName} ${item.rank}위 리플레이 보기`}
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
