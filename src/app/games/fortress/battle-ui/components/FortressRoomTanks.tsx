"use client";

import type { RoomState } from "@/types/fortressSocket";
import { TankSkinPreview } from "../../components/TankSkinPreview";
import { SLOT_COLORS, TEAM_COLORS } from "../../renderer/drawScene";
import { DEFAULT_TANK_SKIN_ID, FORTRESS_SKINS_HREF, TANK_SKIN_LABELS, toTankSkin } from "../../lib/tankSkins";

/** 스킨 이름 — 기본이면 "기본", 아니면 "네온 라인 Lv3" */
export function skinText(skin: unknown): string {
  const s = toTankSkin(skin as { id?: unknown; level?: unknown } | null | undefined);
  return s.id === DEFAULT_TANK_SKIN_ID ? "기본" : `${TANK_SKIN_LABELS[s.id]} Lv${s.level}`;
}

/** 팀전에서 아직 팀을 고르지 않은 자리 — 팀 색처럼 보이지 않게 중립색 */
export const NO_TEAM_COLOR = "#94a3b8";

/** 대기실 탱크 색 — 개인전은 입장 순 자리색, 팀전은 팀색(팀 없음은 중립색) */
export function roomTankColor(mode: RoomState["mode"], team: 0 | 1 | null, index: number): string {
  if (mode === "team") return team === null ? NO_TEAM_COLOR : TEAM_COLORS[team];
  return SLOT_COLORS[index % SLOT_COLORS.length];
}

/**
 * 대기실 탱크 줄(D-025) — 방 플레이어의 장착 스킨을 글자 대신 그림으로(입장 순, 팀전은 팀 색·개인전은 자리 색)
 * 스킨은 방에 들어올 때(다시 들어올 때도) 계정 장착을 서버가 붙인다 — 바꾸면 다시 들어와야 적용돼 스킨 화면은 새 탭으로 연다(이 탭은 방에 남는다)
 */
export function FortressRoomTanks({ room }: { room: RoomState }) {
  const tanks = room.players.map((p, i) => ({
    skin: toTankSkin(p.extra.skin),
    color: roomTankColor(room.mode, p.extra.team, i),
    label: p.name,
  }));
  const label = `방 탱크 미리보기: ${room.players.map((p) => `${p.name} ${skinText(p.extra.skin)}`).join(", ")}`;
  return (
    <section className="rounded-3xl border border-slate-700/50 bg-slate-800/50 p-3" aria-label="탱크 스킨" data-testid="fortress-room-tanks">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-400">탱크 스킨</p>
        <a
          href={FORTRESS_SKINS_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center rounded-full px-2 text-xs font-semibold text-sky-300 hover:text-sky-200"
        >
          스킨 바꾸기 <span aria-hidden="true">↗</span>
          <span className="sr-only">(새 탭)</span>
        </a>
      </div>
      {tanks.length > 0 ? <TankSkinPreview tanks={tanks} className="mt-1 h-24 rounded-2xl" label={label} /> : null}
      <p className="mt-1.5 text-[11px] text-slate-500">바꾼 스킨은 방에 다시 들어오면 적용돼요.</p>
    </section>
  );
}
