"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type JoinLobbyChatAckData,
  type LobbyChatMessage,
  TetrisBattleClientEvents,
  TetrisBattleErrorCodes,
  TetrisBattleServerEvents,
} from "@/types/tetrisBattleSocket";
import { type BattleResult, useBattleSocket } from "../contexts/BattleSocketContext";
import { ACK_TIMEOUT_MS } from "../lib/ackTimeout";

/** 화면에 남기는 글 수 — 서버는 최근 50개만 주지만 열어 둔 동안 받은 글이 쌓인다 */
export const LOBBY_CHAT_KEEP = 100;

export type LobbyChatJoin = "joining" | "joined" | "failed";

/** 글을 id로 합친다 — 재입장 때 받은 최근 글과 이미 받은 글이 겹쳐도 한 번만, 시각 순(같으면 들어온 순) */
export function mergeLobbyMessages(prev: readonly LobbyChatMessage[], incoming: readonly LobbyChatMessage[]): LobbyChatMessage[] {
  const seen = new Set(prev.map((m) => String(m.id)));
  const added = incoming.filter((m) => {
    const id = String(m.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (added.length === 0) return prev as LobbyChatMessage[];
  const merged = [...prev, ...added];
  // 안정 정렬 — 시각이 같으면 들어온 순서
  merged.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return merged.slice(-LOBBY_CHAT_KEEP);
}

/**
 * 테트리스 로비 전체 채팅(tetris-chat) — 대전 소켓(`/tetris-battle`)을 그대로 쓴다(로비는 이미 연결돼 있다)
 * - 연결될 때마다 joinLobbyChat — 서버가 재연결 뒤 자동으로 다시 넣지 않는다. 받은 최근 글은 id로 합친다
 * - 화면을 떠나면 leaveLobbyChat(연결돼 있을 때만, 응답은 기다리지 않는다). 다시 들어갈 때는 보내지 않는다(join과 순서가 꼬이지 않게)
 * - 보내기 ack로 만든 글을 받아 바로 넣는다 — 방송(보낸 사람 포함)과 겹쳐도 id로 한 번만. LOBBY_CHAT_NOT_JOINED면 다시 들어간다
 */
export function useLobbyChat() {
  const { socket, status } = useBattleSocket();
  const [join, setJoin] = useState<LobbyChatJoin>("joining");
  const [messages, setMessages] = useState<LobbyChatMessage[]>([]);
  const [me, setMe] = useState<JoinLobbyChatAckData["me"] | null>(null);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  /**
   * 이 화면에서 내가 보낸 글의 id — 보내기 ack로 안다. 내 글 표시·숨기기 제외는 senderKey가 아니라 이것으로 한다
   * (게스트 senderKey는 IP 기준이라 같은 공유기의 다른 게스트와 같을 수 있다)
   */
  const [myMessageIds, setMyMessageIds] = useState<ReadonlySet<string>>(() => new Set());
  /** 다시 들어가기 — 바뀌면 join을 다시 보낸다 */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!socket) return;
    const onMessage = (message: LobbyChatMessage) => setMessages((prev) => mergeLobbyMessages(prev, [message]));
    socket.on(TetrisBattleServerEvents.LOBBY_CHAT_MESSAGE, onMessage);
    return () => {
      socket.off(TetrisBattleServerEvents.LOBBY_CHAT_MESSAGE, onMessage);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket || status !== "connected") return;
    let cancelled = false;
    setJoin("joining");
    socket
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck(TetrisBattleClientEvents.JOIN_LOBBY_CHAT, {})
      .then((response) => {
        if (cancelled) return;
        if (!response.ok) {
          setJoin("failed");
          return;
        }
        setMessages((prev) => mergeLobbyMessages(prev, response.data.messages));
        setMe(response.data.me);
        setOnlineCount(response.data.onlineCount);
        setJoin("joined");
      })
      .catch(() => {
        if (!cancelled) setJoin("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [socket, status, attempt]);

  // 나가기는 화면을 떠날 때(소켓이 바뀔 때)만 — 다시 들어가기 직전에 보내면 서버에서 join보다 늦게 처리될 수 있다
  useEffect(() => {
    if (!socket) return;
    return () => {
      if (socket.connected) socket.emit(TetrisBattleClientEvents.LEAVE_LOBBY_CHAT, {}, () => {});
    };
  }, [socket]);

  const rejoin = useCallback(() => setAttempt((n) => n + 1), []);

  const send = useCallback(
    async (text: string, guestName?: string): Promise<BattleResult<LobbyChatMessage>> => {
      if (!socket || !socket.connected) return { ok: false, code: "DISCONNECTED" };
      try {
        const response = await socket
          .timeout(ACK_TIMEOUT_MS)
          .emitWithAck(TetrisBattleClientEvents.LOBBY_CHAT, guestName === undefined ? { text } : { text, name: guestName });
        if (!response.ok) {
          // 구독이 풀렸다(서버 재시작·자리 정리 등) — 다시 들어간다. 이 글은 사용자가 다시 보낸다(입력은 그대로)
          if (response.code === TetrisBattleErrorCodes.LOBBY_CHAT_NOT_JOINED) rejoin();
          return { ok: false, code: response.code };
        }
        const message = response.data.message;
        setMessages((prev) => mergeLobbyMessages(prev, [message]));
        setMyMessageIds((prev) => new Set(prev).add(String(message.id)));
        return { ok: true, data: message };
      } catch {
        return { ok: false, code: "TIMEOUT" };
      }
    },
    [socket, rejoin],
  );

  return { status, join, messages, me, onlineCount, myMessageIds, send, rejoin };
}
