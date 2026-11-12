import Link from "next/link";
import type { FortressMatchListItem } from "@/services/fortressService";
import { formatRelativeTime } from "@/app/games/tetris/battle-ui/lib/battleList";
import { fortressMatchPath, fortressResultHeadline, fortressStatLine } from "../lib/fortressShare";

/** 최근 경기 한 줄 — 방 이름·인원·모드·결과·시각, 누르면 기록 페이지 (포트리스 홈 미리보기·전체 목록이 같이 쓴다) */
export function FortressMatchRow({ item, now }: { item: FortressMatchListItem; now: number }) {
  return (
    <li>
      <Link href={fortressMatchPath(item.matchId)} className="flex min-h-12 items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-800/60">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-100">{item.roomName ?? "포트리스 경기"}</span>
          <span className="block truncate text-xs text-slate-400">
            {fortressStatLine(item)} · <span className="text-amber-300">{fortressResultHeadline(item)}</span>
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
