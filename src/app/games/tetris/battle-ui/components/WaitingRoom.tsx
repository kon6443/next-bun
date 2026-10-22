"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/app/teams/components";
import { baseInputStyles } from "@/app/teams/components/FormInput";
import { CHAT_TEXT_MAX_LENGTH, ROOM_MIN_PLAYERS, type RoomState } from "@/types/tetrisBattleSocket";
import { type ConnectionStatus, useBattleSocket } from "../contexts/BattleSocketContext";
import { battleErrorMessage } from "../lib/battleErrors";
import { normalizeChatText } from "../lib/roomForm";
import { ConnectionBadge } from "./ConnectionBadge";
import { EmoteBar } from "./EmoteBar";
import { EmoteBubble } from "./EmoteBubble";

/** 매치 시작을 연다 — 백엔드 매치(P2)가 없는 환경에서 막아야 하면 false */
export const BATTLE_MATCH_AVAILABLE = true;

type WaitingRoomProps = {
  room: RoomState;
  connection: ConnectionStatus;
  onReconnect: () => void;
  onExit: () => void;
  onCopyInvite: () => void;
};

/**
 * 대기실 — 플레이어·준비·방장 시작·초대·채팅·이모트
 */
export function WaitingRoom({ room, connection, onReconnect, onExit, onCopyInvite }: WaitingRoomProps) {
  const { myPlayerId, chat, emotes, setReady, startMatch, sendChat, sendEmote } = useBattleSocket();
  const [error, setError] = useState<string | null>(null);
  const [pendingReady, setPendingReady] = useState(false);
  const [starting, setStarting] = useState(false);

  const me = room.players.find((p) => p.playerId === myPlayerId) ?? null;
  const isHost = room.hostId === myPlayerId;
  // 서버 시작 조건(D-019)과 같다: 2명 이상, 방장 포함 전원 연결, 방장 외 전원 준비
  const everyoneReady =
    room.players.length >= ROOM_MIN_PLAYERS && room.players.every((p) => p.connected && (p.ready || p.playerId === room.hostId));

  const start = async () => {
    setStarting(true);
    const result = await startMatch();
    setStarting(false);
    setError(result.ok ? null : battleErrorMessage(result.code));
  };

  const toggleReady = async () => {
    if (!me) return;
    setPendingReady(true);
    const result = await setReady(!me.ready);
    setPendingReady(false);
    setError(result.ok ? null : battleErrorMessage(result.code));
  };

  return (
    <div className="flex h-full flex-col pt-[env(safe-area-inset-top)]">
      <header className="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={onExit}
          className="flex min-h-11 items-center rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-xs text-slate-400 hover:text-slate-200"
        >
          ← 나가기
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-white">
            {room.locked && (
              <span role="img" aria-label="비밀번호 방">
                🔒{" "}
              </span>
            )}
            {room.name}
          </p>
          <p className="font-mono text-xs tracking-[0.2em] text-slate-400">{room.code}</p>
        </div>
        <ConnectionBadge status={connection} onReconnect={onReconnect} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4" style={{ touchAction: "pan-y" }}>
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
          <section className="rounded-3xl border border-slate-700/50 bg-slate-800/50 p-4" aria-labelledby="battle-players">
            <div className="flex items-center justify-between">
              <h2 id="battle-players" className="text-sm font-semibold text-white">
                플레이어 {room.players.length}/{room.maxPlayers}
              </h2>
              <button type="button" onClick={onCopyInvite} className="min-h-11 px-2 text-xs font-semibold text-sky-300">
                초대 링크 복사
              </button>
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-2">
              {room.players.map((p) => (
                <li
                  key={p.playerId}
                  className={`relative rounded-2xl border px-3 py-3 ${
                    p.playerId === myPlayerId ? "border-sky-400/50 bg-sky-500/10" : "border-slate-700/50 bg-slate-900/60"
                  } ${p.connected ? "" : "opacity-50"}`}
                >
                  <p className="truncate text-sm font-semibold text-white">
                    {p.playerId === room.hostId && (
                      <span role="img" aria-label="방장">
                        👑{" "}
                      </span>
                    )}
                    {p.name}
                    {p.playerId === myPlayerId && <span className="ml-1 text-xs text-sky-300">(나)</span>}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {p.playerId === room.hostId ? "방장" : p.ready ? <span className="text-emerald-300">준비 완료</span> : "대기 중"}
                    {p.isGuest && " · 게스트"}
                    {!p.connected && " · 연결 끊김"}
                  </p>
                  <EmoteBubble emote={emotes[p.playerId]} />
                </li>
              ))}
              {Array.from({ length: room.maxPlayers - room.players.length }, (_, i) => (
                <li key={`empty-${i}`} className="rounded-2xl border border-dashed border-slate-700/60 px-3 py-3 text-xs text-slate-500">
                  빈 자리
                </li>
              ))}
            </ul>

            {room.status !== "WAITING" ? (
              <p className="mt-4 text-center text-sm text-slate-300" role="status">
                {room.status === "PLAYING" ? "게임이 진행 중이에요." : "게임이 끝났어요."}
              </p>
            ) : isHost ? (
              <div className="mt-4">
                <Button
                  type="button"
                  size="md"
                  fullWidth
                  className="min-h-11"
                  onClick={start}
                  disabled={!BATTLE_MATCH_AVAILABLE || !everyoneReady || starting}
                >
                  게임 시작
                </Button>
                <p className="mt-2 text-center text-xs text-slate-500">
                  {!BATTLE_MATCH_AVAILABLE
                    ? "대전 시작은 곧 열려요. 지금은 방·채팅만 쓸 수 있어요."
                    : everyoneReady
                      ? "모두 준비됐어요."
                      : "2명 이상 모이고 모두 준비(연결)되면 시작할 수 있어요."}
                </p>
              </div>
            ) : (
              <Button
                type="button"
                variant={me?.ready ? "secondary" : "primary"}
                size="md"
                fullWidth
                className="mt-4 min-h-11"
                onClick={toggleReady}
                disabled={!me || pendingReady}
                aria-pressed={me?.ready ?? false}
              >
                {me?.ready ? "준비 취소" : "준비"}
              </Button>
            )}
            {error && (
              <p role="alert" className="mt-2 text-sm text-rose-300">
                {error}
              </p>
            )}
          </section>

          <ChatPanel
            messages={chat}
            myPlayerId={myPlayerId}
            enabled={room.status !== "PLAYING"}
            onSend={async (text) => {
              const result = await sendChat(text);
              return result.ok ? null : battleErrorMessage(result.code);
            }}
          />
        </div>
      </div>

      <EmoteBar
        onSend={async (id) => {
          const result = await sendEmote(id);
          if (!result.ok) setError(battleErrorMessage(result.code));
        }}
      />
    </div>
  );
}

function ChatPanel({
  messages,
  myPlayerId,
  enabled,
  onSend,
}: {
  messages: { playerId: string; name: string; text: string; key: number }[];
  myPlayerId: string | null;
  enabled: boolean;
  onSend: (text: string) => Promise<string | null>;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);

  // 새 메시지가 오면 맨 아래로
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeChatText(text);
    if (!normalized) return;
    setSending(true);
    const problem = await onSend(normalized);
    setSending(false);
    setError(problem);
    if (!problem) setText("");
  };

  return (
    <section className="rounded-3xl border border-slate-700/50 bg-slate-800/50 p-4" aria-labelledby="battle-chat">
      <h2 id="battle-chat" className="text-sm font-semibold text-white">
        채팅
      </h2>
      <ol ref={listRef} className="mt-2 flex h-40 flex-col gap-1 overflow-y-auto text-sm" aria-live="polite">
        {messages.length === 0 && <li className="text-xs text-slate-500">입장한 뒤의 대화만 보여요.</li>}
        {messages.map((m) => (
          <li key={m.key} className="break-words">
            <span className={`font-semibold ${m.playerId === myPlayerId ? "text-sky-300" : "text-slate-300"}`}>{m.name}</span>{" "}
            <span className="text-slate-100">{m.text}</span>
          </li>
        ))}
      </ol>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <label htmlFor="battle-chat-input" className="sr-only">
          채팅 입력
        </label>
        <input
          id="battle-chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={CHAT_TEXT_MAX_LENGTH}
          disabled={!enabled}
          placeholder={enabled ? "메시지 입력" : "게임 중에는 이모트만 보낼 수 있어요"}
          autoComplete="off"
          enterKeyHint="send"
          className={`${baseInputStyles} min-h-11 flex-1 px-4 py-2`}
        />
        <Button type="submit" variant="secondary" size="sm" className="min-h-11 shrink-0" disabled={!enabled || sending || text.trim().length === 0}>
          보내기
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-300">
          {error}
        </p>
      )}
    </section>
  );
}
