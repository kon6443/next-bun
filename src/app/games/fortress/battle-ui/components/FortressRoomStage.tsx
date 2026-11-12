"use client";

import toast from "react-hot-toast";
import type { RoomStageProps } from "@/app/games/_shared/battle-room/components/BattleRoomView";
import { WaitingRoomView, defaultCanStart } from "@/app/games/_shared/battle-room/components/WaitingRoomView";
import { TANKS } from "../../engine";
import { ROOM_MAP_IDS, ROOM_MODES, type RoomPlayer, type RoomSettings, type RoomState, TEAM_SIZE } from "@/types/fortressSocket";
import { useFortressSocket } from "../contexts/FortressSocketContext";
import { battleErrorMessage } from "../lib/battleErrors";
import { MAP_LABEL, MODE_LABEL, TEAM_LABEL, settingsSummary } from "../lib/roomLabels";
import { FortressOnlineStage } from "./FortressOnlineStage";
import { FortressRoomTanks } from "./FortressRoomTanks";

const TEAM_DOT = ["bg-sky-400", "bg-orange-400"] as const;

const chip = (active: boolean) =>
  `min-h-11 whitespace-nowrap rounded-xl border px-1 text-xs font-semibold ${active ? "border-sky-400/70 bg-sky-500/20 text-sky-100" : "border-slate-700/60 bg-slate-900/60 text-slate-300"}`;

const teamCount = (room: RoomState, team: 0 | 1) => room.players.filter((p) => p.extra.team === team).length;

/** 시작 조건 — 서버와 같게: 공통(2명↑·전원 연결·방장 외 준비) + 팀전은 정확히 2:2 */
export function fortressCanStart(room: RoomState): boolean {
  if (!defaultCanStart(room)) return false;
  return room.mode !== "team" || (teamCount(room, 0) === TEAM_SIZE && teamCount(room, 1) === TEAM_SIZE);
}

function startHint(room: RoomState): string {
  if (room.mode === "team" && room.players.length === 4 && !(teamCount(room, 0) === TEAM_SIZE && teamCount(room, 1) === TEAM_SIZE)) return "팀을 2:2로 맞춰야 시작할 수 있어요.";
  if (room.mode === "team" && room.players.length < 4) return "팀전은 4명이 모여 2:2로 나눠야 시작할 수 있어요.";
  return "2명 이상 모이고 모두 준비(연결)되면 시작할 수 있어요.";
}

/**
 * 방 안 단계 — 대기실(WAITING)은 공용 대기실에 포트리스 설정(방장: 모드·맵·인원)·팀·탱크 칸을, 경기·결과는 온라인 경기 화면
 */
export function FortressRoomStage(props: RoomStageProps<RoomState>) {
  const { room } = props;
  const api = useFortressSocket();
  const { myPlayerId, updateSettings, setTeam, setTank } = api;
  const isHost = myPlayerId === room.hostId;

  if (room.status !== "WAITING") return <FortressOnlineStage {...props} />;

  const run = async (request: Promise<{ ok: true } | { ok: false; code: string }>) => {
    const result = await request;
    if (!result.ok) toast.error(battleErrorMessage(result.code), { id: "fortress-room-action" });
  };
  const change = (patch: Partial<RoomSettings>) => void run(updateSettings(patch));

  const settingsPanel = isHost ? (
    <section className="rounded-3xl border border-slate-700/50 bg-slate-800/50 p-4" aria-label="방 설정">
      <p className="text-xs font-semibold text-slate-400">방 설정 · 바꾸면 모두 다시 준비해요</p>
      <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="모드">
        {ROOM_MODES.map((m) => (
          <button key={m} type="button" aria-pressed={room.mode === m} className={chip(room.mode === m)} onClick={() => room.mode !== m && change({ mode: m })}>
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="맵">
        {ROOM_MAP_IDS.map((id) => (
          <button key={id} type="button" aria-pressed={room.mapId === id} className={chip(room.mapId === id)} onClick={() => room.mapId !== id && change({ mapId: id })}>
            {MAP_LABEL[id]}
          </button>
        ))}
      </div>
      {room.mode === "ffa" ? (
        <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="최대 인원">
          {[2, 3, 4].map((n) => (
            <button key={n} type="button" aria-pressed={room.maxPlayers === n} className={chip(room.maxPlayers === n)} onClick={() => room.maxPlayers !== n && change({ maxPlayers: n })}>
              {n}명
            </button>
          ))}
        </div>
      ) : null}
    </section>
  ) : (
    <p className="rounded-2xl border border-slate-700/50 bg-slate-800/50 px-4 py-3 text-sm text-slate-300" data-testid="fortress-room-settings">
      {settingsSummary(room)} · 최대 {room.maxPlayers}명
    </p>
  );

  const renderPlayerExtra = (player: RoomPlayer, ctx: { isMe: boolean }) => {
    const { team, tankId } = player.extra;
    const tankName = TANKS[tankId]?.name ?? TANKS[0].name;
    // 스킨(F7)은 위 탱크 줄(FortressRoomTanks)에 그림으로 — 방에 들어올 때 계정 장착을 서버가 붙인다
    if (!ctx.isMe) {
      return (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
          {team !== null ? <span className={`inline-block h-2 w-2 rounded-full ${TEAM_DOT[team]}`} aria-hidden="true" /> : null}
          {team !== null ? `${TEAM_LABEL[team]} · ` : ""}
          {tankName}
        </p>
      );
    }
    return (
      <div className="mt-2 flex flex-col gap-1.5">
        {room.mode === "team" ? (
          <div className="grid grid-cols-2 gap-1" role="group" aria-label="내 팀">
            {([0, 1] as const).map((t) => (
              <button key={t} type="button" aria-pressed={team === t} className={chip(team === t)} onClick={() => team !== t && void run(setTeam(t))}>
                {TEAM_LABEL[t]}
              </button>
            ))}
          </div>
        ) : null}
        <div className="grid grid-cols-3 gap-1" role="group" aria-label="내 탱크">
          {TANKS.map((t) => (
            <button key={t.id} type="button" aria-pressed={tankId === t.id} className={chip(tankId === t.id)} onClick={() => tankId !== t.id && void run(setTank(t.id))}>
              {t.name}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <WaitingRoomView
      {...props}
      api={api}
      errorMessage={battleErrorMessage}
      canStart={fortressCanStart}
      startHint={startHint}
      settingsPanel={
        <>
          {settingsPanel}
          <FortressRoomTanks room={room} />
        </>
      }
      renderPlayerExtra={renderPlayerExtra}
      notes={<p className="mt-4 text-center text-xs text-slate-500">탱크와 팀은 준비한 뒤에도 바꿀 수 있어요.</p>}
    />
  );
}
