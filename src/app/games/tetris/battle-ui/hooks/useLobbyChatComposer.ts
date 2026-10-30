"use client";

import { useState } from "react";
import { CHAT_TEXT_MAX_LENGTH, type LobbyChatMessage, TetrisBattleErrorCodes } from "@/types/tetrisBattleSocket";
import { battleErrorMessage } from "../lib/battleErrors";
import type { useLobbyChat } from "./useLobbyChat";

/** 글자 수는 서버와 같게 코드포인트(이모지 한 개 = 1자)로 센다 */
const countChars = (text: string) => [...text.trim()].length;

/** 한 줄 입력 — 붙여넣은 탭(줄바꿈은 입력칸이 먼저 거른다)은 공백으로. 서버는 줄바꿈·제어 문자가 있으면 CHAT_FORBIDDEN */
const oneLine = (text: string) => text.replace(/[\r\n\t]+/g, " ");

type Options = {
  /** 게스트가 보낼 이름 — 문제가 있으면 이름 칸에 오류를 보이고 null */
  resolveGuestName: () => string | null;
  /** 서버가 게스트 이름을 거절했다(NAME_INVALID·NAME_FORBIDDEN) — 이름 칸에 보인다 */
  onGuestNameError: (message: string) => void;
  /** 보내기 성공 — 목록을 맨 아래로 내리는 등 */
  onSent?: (message: LobbyChatMessage) => void;
};

/**
 * 로비 채팅 입력·보내기(tetris-chat) — 로비 패널과 홈 카드가 같이 쓴다
 * - 들어가는 중에도 입력칸은 열어 둔다(disabled면 포커스·모바일 키보드가 닫힌다) — 보내기만 막는다
 * - 보내면 바로 비운다(기다리는 동안 이어 친 글에 보낸 글이 섞이지 않게). 실패하면 칸이 비어 있을 때만 되돌린다
 */
export function useLobbyChatComposer(chat: ReturnType<typeof useLobbyChat>, { resolveGuestName, onGuestNameError, onSent }: Options) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const length = countChars(text);
  const ready = chat.join === "joined" && chat.status === "connected";
  const canSend = ready && !sending && length > 0 && length <= CHAT_TEXT_MAX_LENGTH;

  const change = (value: string) => {
    setText(oneLine(value));
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    let sendName: string | undefined;
    if (chat.me?.isGuest) {
      const name = resolveGuestName();
      if (!name) return;
      sendName = name;
    }
    const submitted = text;
    setText("");
    setSending(true);
    setError(null);
    const result = await chat.send(submitted.trim(), sendName);
    setSending(false);
    if (result.ok) {
      onSent?.(result.data);
      return;
    }
    setText((current) => (current === "" ? submitted : current));
    if (result.code === TetrisBattleErrorCodes.NAME_INVALID || result.code === TetrisBattleErrorCodes.NAME_FORBIDDEN) {
      onGuestNameError(battleErrorMessage(result.code));
      return;
    }
    setError(
      result.code === TetrisBattleErrorCodes.RATE_LIMITED
        ? "너무 빨리 보내고 있어요. 잠시 후 다시 보내 주세요."
        : result.code === TetrisBattleErrorCodes.INVALID_PAYLOAD
          ? `글은 1~${CHAT_TEXT_MAX_LENGTH}자로 보내 주세요.`
          : battleErrorMessage(result.code),
    );
  };

  return { text, change, sending, error, length, ready, canSend, submit };
}

/**
 * 글의 주인 판정 — senderKey가 me.senderKey와 같은 글(과 이 화면에서 보낸 글)은 숨길 수 없다(숨기면 내 글도 가려진다).
 * 게스트 키는 IP 기준이라 같은 공유기의 다른 게스트도 여기에 든다(서버 한계)
 * "내 글" 색은 그중 회원 글, 또는 이름이 지금 이름과 같은 게스트 글 — 색만 바뀌고 보이기·숨기기에는 쓰지 않는다
 */
export function lobbyChatOwnership(chat: Pick<ReturnType<typeof useLobbyChat>, "me" | "myMessageIds">, guestName: string) {
  const myKey = chat.me?.senderKey ?? null;
  const sentByMe = (m: LobbyChatMessage) => chat.myMessageIds.has(String(m.id));
  const hasMyKey = (m: LobbyChatMessage) => myKey !== null && m.senderKey === myKey;
  return {
    canHide: (m: LobbyChatMessage) => !sentByMe(m) && !hasMyKey(m),
    isMine: (m: LobbyChatMessage) => sentByMe(m) || (hasMyKey(m) && (!m.isGuest || m.name === guestName)),
  };
}
