"use client";

import { BattleLobbyView } from "@/app/games/_shared/battle-room/components/BattleLobbyView";
import { ROOM_MAX_PLAYERS, ROOM_MIN_PLAYERS } from "@/types/tetrisBattleSocket";
import { useBattleSocket, useEnterScope } from "../contexts/BattleSocketContext";
import { usePlayerName } from "../hooks/usePlayerName";
import { battleErrorMessage } from "../lib/battleErrors";
import { battleRoomPath } from "../lib/battleList";
import { LobbyChatPanel } from "./LobbyChatPanel";

export { LIST_RETRY_MS } from "@/app/games/_shared/battle-room/components/BattleLobbyView";

const PLAYER_COUNTS = Array.from({ length: ROOM_MAX_PLAYERS - ROOM_MIN_PLAYERS + 1 }, (_, i) => ROOM_MIN_PLAYERS + i);
const BACK = { href: "/games/tetris", label: "테트리스" };
const INTRO = { title: "친구와 대전", description: "2~4명이 같은 블록 순서로 겨뤄요. 줄을 지우면 상대에게 방해 줄이 가요." };

/**
 * 테트리스 대전 로비 — 공용 로비(BattleLobbyView)에 테트리스 소켓·이름 저장값·경로·문구·로비 채팅(tetris-chat)을 잇는다
 */
export function BattleLobby() {
  const api = useBattleSocket();
  // 로비를 떠나면 아직 응답이 안 온 방 만들기는 버린다(늦게 성공하면 컨텍스트가 바로 나간다)
  const enterScope = useEnterScope();
  const player = usePlayerName();
  return (
    <BattleLobbyView
      api={api}
      enterScope={enterScope}
      player={player}
      errorMessage={battleErrorMessage}
      roomPath={battleRoomPath}
      back={BACK}
      intro={INTRO}
      playerCounts={PLAYER_COUNTS}
      renderLobbyChat={(chat) => <LobbyChatPanel {...chat} />}
    />
  );
}
