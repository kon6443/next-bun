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
 * 제목 줄(열린 방 수) + 빠른 참가·방 만들기 + 전체 보기(로비) — 방 목록은 로비에서(tetris-home D-003, 홈을 짧게)
 * 미리보기 방(rooms)이 없는 서버면 방 수 문구와 로비 링크만
 * 홈에서 게임 시작 다음 자리 — 눈에 띄게 색 테두리 카드(tetris-home: "대전이 눈에 안 띈다"). 카드 틀은 여기서 그린다
 */
export function BattleEntry() {
  const stats = useBattleLobbyStats({ refreshMs: LOBBY_REFRESH_MS });

  return (
    <section
      id={BATTLE_SECTION_ID}
      aria-labelledby="tetris-battle-heading"
      data-testid="tetris-battle-entry"
      className="scroll-mt-4 rounded-3xl border border-fuchsia-400/40 bg-gradient-to-br from-fuchsia-500/15 via-slate-900/90 to-cyan-500/10 p-4 shadow-[0_0_24px_rgba(217,70,239,0.12)]"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 id="tetris-battle-heading" className="text-lg font-bold text-white">
            <span aria-hidden="true">⚔️ </span>친구와 대전
          </h2>
          {/* 자리를 미리 잡아 문구가 늦게 와도 아래가 밀리지 않게 */}
          <p className="min-h-4 text-xs leading-4 text-slate-400">{stats && lobbyStatsLabel(stats)}</p>
        </div>
        <Link href="/games/tetris/battle" aria-label="대전 전체 보기" className="flex min-h-11 shrink-0 items-center px-1 text-sm text-fuchsia-200 hover:text-fuchsia-100">
          전체 보기<span aria-hidden="true">&nbsp;›</span>
        </Link>
      </div>
      {/* 받는 중(또는 실패해 다시 묻는 중)에도 방 만들기는 쓸 수 있다. 미리보기 방이 없는 옛 서버면 방 수 문구만 */}
      {(stats === null || stats.rooms) && (
        <div className="mt-2">
          <BattleRoomsPreview rooms={stats?.rooms ?? null} />
        </div>
      )}
    </section>
  );
}
