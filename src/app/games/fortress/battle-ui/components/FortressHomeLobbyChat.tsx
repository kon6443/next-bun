"use client";

import { HomeLobbyChatCard } from "@/app/games/_shared/battle-room/lobby-chat/HomeLobbyChatCard";
import { usePlayerName } from "@/app/games/tetris/battle-ui/hooks/usePlayerName";
import { FortressSocketProvider, useFortressSocket } from "../contexts/FortressSocketContext";
import { battleErrorMessage } from "../lib/battleErrors";
import { fortressHiddenSenders } from "../lib/lobbyChatHidden";
import { FORTRESS_LOBBY_CHAT_SECTION_ID, FORTRESS_LOBBY_PATH } from "../lib/roomLabels";

/**
 * 포트리스 홈의 로비 채팅 카드(D-022) — 테트리스 홈과 같은 공용 카드, 채널은 서버 fortress:lobby-chat(로비 패널과 같음)
 * 홈에 있는 동안만 포트리스 소켓을 연다 — 떠나면 provider가 연결을 끊는다. 홈은 서버 렌더(SEO)라 이 카드만 클라이언트
 */
export function FortressHomeLobbyChat() {
  return (
    <FortressSocketProvider>
      <FortressHomeLobbyChatCard />
    </FortressSocketProvider>
  );
}

function FortressHomeLobbyChatCard() {
  const { socket, status, reconnect } = useFortressSocket();
  const player = usePlayerName();
  return (
    <HomeLobbyChatCard
      socket={socket}
      status={status}
      reconnect={reconnect}
      player={player}
      hidden={fortressHiddenSenders}
      errorMessage={battleErrorMessage}
      chatHref={`${FORTRESS_LOBBY_PATH}#${FORTRESS_LOBBY_CHAT_SECTION_ID}`}
    />
  );
}
