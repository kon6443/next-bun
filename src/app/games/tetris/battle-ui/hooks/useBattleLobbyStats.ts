"use client";

import { useEffect, useState } from "react";
import type { BattleLobbyStats } from "@/services/tetrisBattleService";
import { loadBattleLobbyStats } from "../lib/battleMatchLoader";

/**
 * 입구의 로비 정보(방 수·미리보기 방) — 소켓 없이 REST(D-025). 실패하면 직전 값 그대로(처음이면 null — 입구 버튼은 그대로 쓴다)
 * refreshMs를 주면 화면이 보이는 동안 그 간격으로 다시 묻는다 — 탭이 숨으면 멈추고, 돌아오면 바로 한 번(서버 캐시 2초)
 * StrictMode 재마운트로 effect가 두 번 돌아도 진행 중인 요청을 함께 쓴다(battleMatchLoader)
 */
export function useBattleLobbyStats({ refreshMs }: { refreshMs?: number } = {}): BattleLobbyStats | null {
  const [stats, setStats] = useState<BattleLobbyStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const load = () => {
      loadBattleLobbyStats()
        .then((next) => {
          if (!cancelled) setStats(next);
        })
        .catch(() => {
          // 방 정보는 보조 — 다음 갱신에서 다시 묻는다
        });
    };
    const start = () => {
      if (timer !== undefined || !refreshMs) return;
      timer = setInterval(load, refreshMs);
    };
    const stop = () => {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
        return;
      }
      load();
      start();
    };
    load();
    if (refreshMs) {
      if (!document.hidden) start();
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshMs]);
  return stats;
}
