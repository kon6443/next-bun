"use client";

import { HomeLobbyChatCard } from "@/app/games/_shared/battle-room/lobby-chat/HomeLobbyChatCard";
import { BattleSocketProvider, useBattleSocket } from "../contexts/BattleSocketContext";
import { usePlayerName } from "../hooks/usePlayerName";
import { LOBBY_CHAT_HREF } from "../lib/battleList";
import { battleErrorMessage } from "../lib/battleErrors";
import { tetrisHiddenSenders } from "../lib/lobbyChatHidden";

/**
 * 테트리스 홈의 로비 채팅 카드(tetris-home-chat) — 본체는 공용 HomeLobbyChatCard, 소켓은 대전 소켓(`/tetris-battle`)
 * 홈에 있는 동안만 대전 소켓을 연다 — 떠나면 provider가 연결을 끊는다
 */
export function HomeLobbyChat() {
  return (
    <BattleSocketProvider>
      <TetrisHomeLobbyChat />
    </BattleSocketProvider>
  );
}

function TetrisHomeLobbyChat() {
  const { socket, status, reconnect } = useBattleSocket();
  const player = usePlayerName();
  return <HomeLobbyChatCard socket={socket} status={status} reconnect={reconnect} player={player} hidden={tetrisHiddenSenders} errorMessage={battleErrorMessage} chatHref={LOBBY_CHAT_HREF} />;
}
