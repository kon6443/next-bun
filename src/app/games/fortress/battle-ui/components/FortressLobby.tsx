"use client";

import { useState } from "react";
import { BattleLobbyView, type LobbyChatSlotContext } from "@/app/games/_shared/battle-room/components/BattleLobbyView";
import { LobbyChatPanelView } from "@/app/games/_shared/battle-room/lobby-chat/LobbyChatPanel";
import { useLobbyChatCore } from "@/app/games/_shared/battle-room/lobby-chat/useLobbyChat";
import { usePlayerName } from "@/app/games/tetris/battle-ui/hooks/usePlayerName";
import { type CreateRoomPayload, ROOM_MAP_IDS, ROOM_MODES, type RoomMapId, type RoomMode, type RoomSummary } from "@/types/fortressSocket";
import { useEnterScope, useFortressSocket } from "../contexts/FortressSocketContext";
import { battleErrorMessage } from "../lib/battleErrors";
import { fortressHiddenSenders } from "../lib/lobbyChatHidden";
import { FORTRESS_LOBBY_CHAT_SECTION_ID, MAP_LABEL, MODE_LABEL, fortressRoomPath, settingsSummary } from "../lib/roomLabels";

const BACK = { href: "/games/fortress", label: "포트리스" };
const INTRO = { title: "친구와 포트리스", description: "2~4명 개인전 또는 2:2 팀전. 차례대로 바람을 읽고 쏘세요." };
/** 팀전은 4명 고정 */
const FFA_COUNTS = [2, 3, 4] as const;
const TEAM_COUNTS = [4] as const;

const pill = (active: boolean) =>
  `min-h-11 rounded-xl border text-sm font-semibold ${active ? "border-sky-400/70 bg-sky-500/20 text-sky-100" : "border-slate-700/60 bg-slate-900/60 text-slate-300"}`;

/**
 * 포트리스 대전 로비(F5) — 공용 로비(BattleLobbyView)에 포트리스 소켓·이름·경로·방 설정(모드·맵)·로비 채팅(D-016, 포트리스 채널)을 잇는다
 * 이름 저장값은 테트리스 대전과 같다(같은 사람이 두 게임에서 같은 이름)
 */
export function FortressLobby() {
  const api = useFortressSocket();
  // 로비를 떠나면 아직 응답이 안 온 방 만들기는 버린다
  const enterScope = useEnterScope();
  const player = usePlayerName();
  const [mode, setMode] = useState<RoomMode>("ffa");
  const [mapId, setMapId] = useState<RoomMapId>("random");

  return (
    <BattleLobbyView<RoomSummary, CreateRoomPayload>
      api={api}
      enterScope={enterScope}
      player={player}
      errorMessage={battleErrorMessage}
      roomPath={fortressRoomPath}
      back={BACK}
      intro={INTRO}
      playerCounts={mode === "team" ? TEAM_COUNTS : FFA_COUNTS}
      createPayload={{ mode, mapId }}
      createFields={
        <>
          <fieldset className="mt-3">
            <legend className="text-xs text-slate-400">모드</legend>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {ROOM_MODES.map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={pill(mode === m)}>
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-3">
            <legend className="text-xs text-slate-400">맵</legend>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {ROOM_MAP_IDS.map((id) => (
                <button key={id} type="button" aria-pressed={mapId === id} onClick={() => setMapId(id)} className={pill(mapId === id)}>
                  {MAP_LABEL[id]}
                </button>
              ))}
            </div>
          </fieldset>
        </>
      }
      renderRoomMeta={(room) => `${room.playerCount}/${room.maxPlayers}명 · ${settingsSummary(room)} · ${room.status === "WAITING" ? "대기 중" : "진행 중"}`}
      renderLobbyChat={(chat) => <FortressLobbyChat {...chat} />}
    />
  );
}

/** 포트리스 로비 전체 채팅 — 같은 공용 패널, 채널(서버 fortress:lobby-chat)·숨김 저장은 테트리스와 따로 */
function FortressLobbyChat(props: LobbyChatSlotContext) {
  const { socket, status } = useFortressSocket();
  const chat = useLobbyChatCore({ socket, status });
  return <LobbyChatPanelView {...props} chat={chat} hidden={fortressHiddenSenders} errorMessage={battleErrorMessage} sectionId={FORTRESS_LOBBY_CHAT_SECTION_ID} />;
}
