"use client";

import { useEffect, useState } from "react";
import { ButtonLink } from "@/app/teams/components";
import { loadBattleLobbyStats } from "../lib/battleMatchLoader";
import { lobbyStatsLabel } from "../lib/battleList";

/**
 * 테트리스 홈의 대전 입구 (DESIGN §19) — "친구와 대전" + 지금 열린 방 수
 * 방 수는 소켓 없이 REST 한 번 — 홈 방문자마다 소켓을 열지 않는다(D-025). 실패하면 문구만 숨긴다
 */
export function BattleEntry() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // StrictMode 재마운트로 effect가 두 번 돌아도 진행 중인 요청을 함께 쓴다(battleMatchLoader)
    loadBattleLobbyStats()
      .then((stats) => {
        if (!cancelled) setLabel(lobbyStatsLabel(stats));
      })
      .catch(() => {
        // 방 수는 보조 정보 — 버튼은 그대로 쓸 수 있다
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col">
      <ButtonLink href="/games/tetris/battle" size="md" fullWidth className="min-h-11">
        친구와 대전
      </ButtonLink>
      {/* 자리를 미리 잡아 문구가 늦게 와도 아래가 밀리지 않게 */}
      <p className="mt-1.5 min-h-4 text-center text-xs leading-4 text-slate-400">
        {label}
      </p>
    </div>
  );
}
