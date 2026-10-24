"use client";

import { useEffect, useState } from "react";
import type { BattleLobbyStats } from "@/services/tetrisBattleService";
import { loadBattleLobbyStats } from "../lib/battleMatchLoader";

/**
 * 입구의 로비 정보(방 수·미리보기 방) — 소켓 없이 REST 한 번(D-025). 실패하면 null 그대로(입구 버튼은 그대로 쓴다)
 * StrictMode 재마운트로 effect가 두 번 돌아도 진행 중인 요청을 함께 쓴다(battleMatchLoader)
 */
export function useBattleLobbyStats(): BattleLobbyStats | null {
  const [stats, setStats] = useState<BattleLobbyStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadBattleLobbyStats()
      .then((next) => {
        if (!cancelled) setStats(next);
      })
      .catch(() => {
        // 방 정보는 보조 — 버튼은 그대로 쓸 수 있다
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return stats;
}
