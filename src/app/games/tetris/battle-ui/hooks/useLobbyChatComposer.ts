"use client";

import type { LobbyChatMessage } from "@/types/tetrisBattleSocket";
import { useLobbyChatComposerCore } from "@/app/games/_shared/battle-room/lobby-chat/useLobbyChatComposer";
import { battleErrorMessage } from "../lib/battleErrors";
import type { useLobbyChat } from "./useLobbyChat";

export { lobbyChatOwnership } from "@/app/games/_shared/battle-room/lobby-chat/useLobbyChatComposer";

type Options = {
  resolveGuestName: () => string | null;
  onGuestNameError: (message: string) => void;
  onSent?: (message: LobbyChatMessage) => void;
};

/** 로비 채팅 입력·보내기(tetris-chat) — 본체는 공용, 에러 안내만 테트리스 문구로 */
export function useLobbyChatComposer(chat: ReturnType<typeof useLobbyChat>, options: Options) {
  return useLobbyChatComposerCore(chat, { ...options, errorMessage: battleErrorMessage });
}
