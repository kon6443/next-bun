"use client";

import { BattleRoomView } from "@/app/games/_shared/battle-room/components/BattleRoomView";
import { useBattleSocket, useEnterScope } from "../contexts/BattleSocketContext";
import { usePlayerName } from "../hooks/usePlayerName";
import { battleErrorMessage } from "../lib/battleErrors";
import { consumeReloadEntry } from "../lib/pageReload";
import { loadRoomSession } from "../lib/roomSession";
import { RoomStage } from "./RoomStage";

const LOBBY_PATH = "/games/tetris/battle";

/**
 * 테트리스 대전 방 화면 — 공용 입장 화면(BattleRoomView)에 테트리스 소켓·이름·재연결 저장소·대기실/대전(RoomStage)을 잇는다
 */
export function BattleRoom({ code, lockedHint }: { code: string; lockedHint: boolean }) {
  const api = useBattleSocket();
  // 이 화면을 떠나면 아직 응답이 안 온 입장은 버린다(늦게 성공하면 컨텍스트가 바로 나간다)
  const enterScope = useEnterScope();
  const player = usePlayerName();
  return (
    <BattleRoomView
      code={code}
      lockedHint={lockedHint}
      api={api}
      enterScope={enterScope}
      player={player}
      errorMessage={battleErrorMessage}
      loadSession={loadRoomSession}
      consumeReloadEntry={consumeReloadEntry}
      lobbyPath={LOBBY_PATH}
      renderStage={(stage) => <RoomStage {...stage} />}
    />
  );
}
