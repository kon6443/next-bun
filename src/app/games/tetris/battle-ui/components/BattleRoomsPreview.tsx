"use client";

import Link from "next/link";
import type { BattleLobbyRoom } from "@/services/tetrisBattleService";
import { BATTLE_CREATE_HREF, battleRoomPath, pickQuickJoinRoom } from "../lib/battleList";

/**
 * 대전 입구의 바로가기 (games-polish P7·P8 → tetris-home D-003) — 테트리스 홈 대전 카드
 * "빠른 참가"(잠기지 않은 열린 방이 있을 때 첫 방으로)·"방 만들기"(로비의 만들기 카드)만 — 방 목록은 "전체 보기"(로비)에서 본다
 * rooms가 null이면 받는 중 — 빠른 참가 없이 방 만들기만(받는 중에도 쓸 수 있게)
 */
export function BattleRoomsPreview({ rooms }: { rooms: readonly BattleLobbyRoom[] | null }) {
  const quick = rooms ? pickQuickJoinRoom(rooms) : null;
  return (
    <div className="flex gap-2" data-testid="battle-rooms-preview">
      {quick && (
        <Link
          href={battleRoomPath(quick.code)}
          className="flex min-h-11 flex-1 items-center justify-center rounded-full border border-sky-400/50 text-sm font-semibold text-sky-100 hover:bg-sky-500/10"
        >
          빠른 참가
        </Link>
      )}
      <Link
        href={BATTLE_CREATE_HREF}
        className="flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/20 text-sm font-semibold text-slate-200 hover:border-white/40"
      >
        방 만들기
      </Link>
    </div>
  );
}
