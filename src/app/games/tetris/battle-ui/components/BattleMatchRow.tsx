import Link from "next/link";
import type { BattleMatchListItem } from "@/services/tetrisBattleService";
import { battleMatchPath } from "../lib/battleShare";
import { formatRelativeTime } from "../lib/battleList";

/** 최근 대전 한 줄 — 방 이름·인원·우승자·시각, 누르면 기록 페이지 (테트리스 홈 미리보기·전체 목록이 같이 쓴다) */
export function BattleMatchRow({ item, now }: { item: BattleMatchListItem; now: number }) {
  return (
    <li>
      <Link
        href={battleMatchPath(item.matchId)}
        className="flex min-h-12 items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-800/60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-100">{item.roomName}</span>
          <span className="block truncate text-xs text-slate-400">
            {item.playerCount}인전
            {/* 계약상 늘 있지만(VERIFIED 경기는 1위가 있다) 비어 오면 우승 문구만 뺀다 */}
            {item.winnerName && (
              <>
                {" · "}
                <span className="text-amber-300">{item.winnerName}</span> 우승
              </>
            )}
            {item.disputed && " · 일부 기록 검증 실패"}
          </span>
        </span>
        <time dateTime={item.endedAt} className="shrink-0 text-xs text-slate-500">
          {formatRelativeTime(item.endedAt, now)}
        </time>
        <span aria-hidden="true" className="text-slate-600">
          ›
        </span>
      </Link>
    </li>
  );
}
