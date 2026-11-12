"use client";

import { useBattleSocket } from "../contexts/BattleSocketContext";
import { useLobbyChatCore } from "@/app/games/_shared/battle-room/lobby-chat/useLobbyChat";

export { LOBBY_CHAT_KEEP, type LobbyChatJoin, mergeLobbyMessages } from "@/app/games/_shared/battle-room/lobby-chat/useLobbyChat";

/** 테트리스 로비 전체 채팅(tetris-chat) — 대전 소켓(`/tetris-battle`)을 그대로 쓴다. 본체는 공용 useLobbyChatCore */
export function useLobbyChat() {
  const { socket, status } = useBattleSocket();
  return useLobbyChatCore({ socket, status });
}
