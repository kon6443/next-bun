"use client";

import { BattleRoomView } from "@/app/games/_shared/battle-room/components/BattleRoomView";
import { consumeReloadEntry } from "@/app/games/tetris/battle-ui/lib/pageReload";
import { usePlayerName } from "@/app/games/tetris/battle-ui/hooks/usePlayerName";
import { useEnterScope, useFortressSocket } from "../contexts/FortressSocketContext";
import { battleErrorMessage } from "../lib/battleErrors";
import { FORTRESS_LOBBY_PATH } from "../lib/roomLabels";
import { loadRoomSession } from "../lib/roomSession";
import { FortressRoomStage } from "./FortressRoomStage";

/** 포트리스 대전 방 화면 — 공용 입장 화면에 포트리스 소켓·재연결 저장소('fortress:battle:')·대기실/경기(FortressRoomStage)를 잇는다 */
export function FortressRoom({ code, lockedHint }: { code: string; lockedHint: boolean }) {
  const api = useFortressSocket();
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
      lobbyPath={FORTRESS_LOBBY_PATH}
      renderStage={(stage) => <FortressRoomStage {...stage} />}
    />
  );
}
