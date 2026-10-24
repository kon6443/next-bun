"use client";

import { useBattleLobbyStats } from "../hooks/useBattleLobbyStats";
import { BattleRoomsPreview } from "./BattleRoomsPreview";

/** 게임 목록 테트리스 카드의 방 미리보기 (games-polish P7) — 미리보기 방이 없는 서버·실패면 아무것도 그리지 않는다 */
export function BattleRoomsTeaser() {
  const stats = useBattleLobbyStats();
  return stats?.rooms ? <BattleRoomsPreview rooms={stats.rooms} /> : null;
}
