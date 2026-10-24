"use client";

import Link from "next/link";
import { useBattleLobbyStats } from "../hooks/useBattleLobbyStats";
import { BATTLE_SECTION_ID } from "./BattleEntry";

/**
 * 게임 목록 테트리스 카드의 대전 링크 (games-polish P8) — 입구는 테트리스 홈 대전 섹션 한 곳, 여기는 링크 하나와 열린 방 수만
 * 방 수는 한 번만 묻는다(목록 화면은 오래 머무는 곳이 아니다). 실패·0개면 배지 없이
 */
export function BattleEntryLink() {
  const stats = useBattleLobbyStats();
  const open = stats?.waitingRooms ?? 0;
  return (
    <Link
      href={`/games/tetris#${BATTLE_SECTION_ID}`}
      className="mt-2 flex min-h-11 items-center justify-center gap-2 rounded-full border border-pink-400/40 bg-pink-500/10 text-sm font-semibold text-pink-100 hover:border-pink-300/60"
    >
      친구와 대전
      {open > 0 && (
        <span className="rounded-full bg-pink-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white" data-testid="battle-open-rooms">
          열린 방 {open}
        </span>
      )}
    </Link>
  );
}
