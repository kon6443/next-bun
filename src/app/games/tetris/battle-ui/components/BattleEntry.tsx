"use client";

import Link from "next/link";
import { useBattleLobbyStats } from "../hooks/useBattleLobbyStats";
import { lobbyStatsLabel } from "../lib/battleList";
import { BattleRoomsPreview } from "./BattleRoomsPreview";

/** 홈 대전 섹션 — 화면이 보이는 동안 방 목록을 이 간격으로 다시 받는다(서버 캐시 2초, 소켓 없음 D-025) */
export const LOBBY_REFRESH_MS = 10_000;

/** /games 카드의 대전 링크가 여기로 온다 */
export const BATTLE_SECTION_ID = "battle";

/**
 * 테트리스 홈의 대전 섹션 (DESIGN §19, games-polish P8) — 대전 입구는 여기 한 곳
 * 방 목록을 늘 보인다: 열린 방(최대 3)·없으면 빈 상태 + 빠른 참가·방 만들기 + 전체 보기(로비)
 * 미리보기 방(rooms)이 없는 서버면 방 수 문구와 로비 링크만
 */
export function BattleEntry() {
  const stats = useBattleLobbyStats({ refreshMs: LOBBY_REFRESH_MS });

  return (
    <section id={BATTLE_SECTION_ID} aria-labelledby="tetris-battle-heading" className="scroll-mt-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 id="tetris-battle-heading" className="text-base font-semibold text-white">
            친구와 대전
          </h2>
          {/* 자리를 미리 잡아 문구가 늦게 와도 아래가 밀리지 않게 */}
          <p className="min-h-4 text-xs leading-4 text-slate-400">{stats && lobbyStatsLabel(stats)}</p>
        </div>
        <Link
          href="/games/tetris/battle"
          className="flex min-h-11 shrink-0 items-center rounded-full border border-white/20 px-4 text-sm font-semibold text-slate-200 hover:border-white/40"
        >
          전체 보기
        </Link>
      </div>
      {stats?.rooms && (
        <div className="mt-3">
          <BattleRoomsPreview rooms={stats.rooms} />
        </div>
      )}
    </section>
  );
}
