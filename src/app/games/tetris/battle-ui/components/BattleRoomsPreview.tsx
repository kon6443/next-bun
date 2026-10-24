"use client";

import Link from "next/link";
import type { BattleLobbyRoom } from "@/services/tetrisBattleService";
import { BATTLE_CREATE_HREF, battleRoomPath, pickQuickJoinRoom } from "../lib/battleList";

/** 입구에 보일 방 수 — 서버도 최대 3개를 준다 */
const PREVIEW_ROOMS = 3;

/**
 * 대전 입구의 방 목록 (games-polish P7·P8) — 테트리스 홈 대전 섹션
 * 방마다 이름·인원·🔒와 "들어가기" · 없으면 빈 상태 · 아래에 "빠른 참가"(잠기지 않은 방이 있을 때)·"방 만들기"
 */
export function BattleRoomsPreview({ rooms }: { rooms: readonly BattleLobbyRoom[] }) {
  const quick = pickQuickJoinRoom(rooms);
  return (
    <div className="flex flex-col gap-2" data-testid="battle-rooms-preview">
      {rooms.length > 0 ? (
        <ul className="flex flex-col gap-1.5" aria-label="열린 방">
          {rooms.slice(0, PREVIEW_ROOMS).map((room) => (
            <li key={room.code} className="flex items-center gap-2 rounded-2xl border border-slate-700/50 bg-slate-900/60 py-1 pl-3 pr-1">
              <p className="min-w-0 flex-1 truncate text-sm text-white">
                {room.locked && (
                  <span role="img" aria-label="비밀번호 방">
                    🔒{" "}
                  </span>
                )}
                {room.name}
                <span className="ml-1.5 text-xs text-slate-400">
                  {room.playerCount}/{room.maxPlayers}명
                </span>
              </p>
              <Link
                href={battleRoomPath(room.code, room.locked)}
                aria-label={`${room.name} 들어가기`}
                className="flex min-h-11 shrink-0 items-center rounded-full px-3 text-xs font-semibold text-sky-200 hover:bg-sky-500/10"
              >
                들어가기
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-700/60 px-4 py-3 text-center text-sm text-slate-400">지금 열린 방이 없어요</p>
      )}
      <div className="flex gap-2">
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
    </div>
  );
}
