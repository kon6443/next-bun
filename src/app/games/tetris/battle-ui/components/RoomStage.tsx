"use client";

import { useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { submitBattleReplay } from "@/services/tetrisBattleService";
import type { BattleReplayInput } from "../../battle-engine";
import type { RoomState } from "@/types/tetrisBattleSocket";
import { useReducedEffects } from "../../hooks/useReducedEffects";
import { loadSettings } from "../../lib/storage";
import { type ConnectionStatus, useBattleSocket } from "../contexts/BattleSocketContext";
import { useAttackTrails } from "../hooks/useAttackTrails";
import { useBattleMatch } from "../hooks/useBattleMatch";
import { submitReplayWithRetry } from "../lib/replaySubmit";
import { MatchScreen } from "./MatchScreen";
import { WaitingRoom } from "./WaitingRoom";

type RoomStageProps = {
  room: RoomState;
  connection: ConnectionStatus;
  onReconnect: () => void;
  onExit: () => void;
  onCopyInvite: () => void;
};

/**
 * 방 안 — 매치 이벤트는 대기실에 있을 때부터 받아야 하므로 여기서 연동하고, 단계에 따라 대기실·대전 화면을 고른다
 */
export function RoomStage({ room, connection, onReconnect, onExit, onCopyInvite }: RoomStageProps) {
  const { socket, myPlayerId, registerMatchSync, recoverSeat, playerTokenFor } = useBattleSocket();
  const { data: authSession } = useSession();
  const accessToken = authSession?.user?.accessToken ?? undefined;
  const reduced = useReducedEffects();
  const { rootRef, fire } = useAttackTrails(reduced);
  // DAS·ARR은 싱글과 같은 개인 설정을 쓴다 (리플레이에 함께 기록)
  const [settings] = useState(() => loadSettings());
  // 경기 후 리플레이 제출 — 인증은 이 탭이 방에 들어갈 때 받은 playerToken(저장소 값은 다른 탭이 바꿀 수 있다), 로그인이면 USER_ID도 남는다
  const submitReplay = useCallback(
    async (matchId: string, replay: BattleReplayInput) => {
      const playerToken = playerTokenFor(room.code);
      if (!playerToken) return "failed" as const;
      return submitReplayWithRetry(submitBattleReplay, matchId, playerToken, replay, accessToken);
    },
    [room.code, accessToken, playerTokenFor],
  );
  const match = useBattleMatch({
    socket,
    room,
    myPlayerId,
    das: settings.das,
    arr: settings.arr,
    registerMatchSync,
    recoverSeat,
    onAttack: fire,
    submitReplay,
  });

  if (match.phase.kind === "idle" || !myPlayerId) {
    return <WaitingRoom room={room} connection={connection} onReconnect={onReconnect} onExit={onExit} onCopyInvite={onCopyInvite} />;
  }

  return (
    <MatchScreen
      phase={match.phase}
      play={match.play}
      myPlayerId={myPlayerId}
      isHost={room.hostId === myPlayerId}
      opponents={match.opponents}
      targetId={match.targetId}
      myKos={match.myKos}
      replaySubmit={match.replaySubmit}
      trailsRootRef={rootRef}
      roomPlayers={room.players}
      roomStatus={room.status}
      connection={connection}
      onReconnect={onReconnect}
      onExit={onExit}
    />
  );
}
