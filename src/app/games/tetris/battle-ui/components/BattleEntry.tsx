"use client";

import { ButtonLink } from "@/app/teams/components";
import { useBattleLobbyStats } from "../hooks/useBattleLobbyStats";
import { lobbyStatsLabel } from "../lib/battleList";
import { BattleRoomsPreview } from "./BattleRoomsPreview";

/**
 * 테트리스 홈의 대전 입구 (DESIGN §19) — "친구와 대전" + 지금 열린 방 수 + 방 미리보기(P7)
 * 방 정보는 소켓 없이 REST 한 번 — 홈 방문자마다 소켓을 열지 않는다(D-025). 실패하면 문구만 숨긴다
 * 미리보기 방(rooms)이 없는 서버면 예전처럼 방 수만
 */
export function BattleEntry() {
  const stats = useBattleLobbyStats();

  return (
    <div className="flex flex-col">
      <ButtonLink href="/games/tetris/battle" size="md" fullWidth className="min-h-11">
        친구와 대전
      </ButtonLink>
      {/* 자리를 미리 잡아 문구가 늦게 와도 아래가 밀리지 않게 */}
      <p className="mt-1.5 min-h-4 text-center text-xs leading-4 text-slate-400">
        {stats && lobbyStatsLabel(stats)}
      </p>
      {stats?.rooms && <BattleRoomsPreview rooms={stats.rooms} />}
    </div>
  );
}
