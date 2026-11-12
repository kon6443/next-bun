"use client";

import { LobbyChatPanelView } from "@/app/games/_shared/battle-room/lobby-chat/LobbyChatPanel";
import { useLobbyChat } from "../hooks/useLobbyChat";
import { battleErrorMessage } from "../lib/battleErrors";
import { LOBBY_CHAT_SECTION_ID } from "../lib/battleList";
import { tetrisHiddenSenders } from "../lib/lobbyChatHidden";

type Props = {
  guestName: string;
  resolveGuestName: () => string | null;
  onGuestNameError: (message: string) => void;
};

/** 테트리스 로비 전체 채팅 패널(tetris-chat) — 공용 패널에 테트리스 소켓·문구·숨김 저장·섹션 id를 잇는다 */
export function LobbyChatPanel(props: Props) {
  const chat = useLobbyChat();
  return <LobbyChatPanelView {...props} chat={chat} hidden={tetrisHiddenSenders} errorMessage={battleErrorMessage} sectionId={LOBBY_CHAT_SECTION_ID} />;
}
