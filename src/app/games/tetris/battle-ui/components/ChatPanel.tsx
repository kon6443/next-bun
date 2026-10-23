"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/app/teams/components";
import { baseInputStyles } from "@/app/teams/components/FormInput";
import { CHAT_TEXT_MAX_LENGTH } from "@/types/tetrisBattleSocket";
import { normalizeChatText } from "../lib/roomForm";

/**
 * 방 채팅 — 대기실(카드)·경기 중 관전(화면 아래 compact)이 함께 쓴다
 * compact = 대전 화면 아래 줄: 목록을 낮게, 제목은 읽어 주기만 (D-016)
 */
export function ChatPanel({
  messages,
  myPlayerId,
  enabled,
  onSend,
  compact = false,
  disabledHint = "게임 중에는 이모트만 보낼 수 있어요",
}: {
  messages: { playerId: string; name: string; text: string; key: number }[];
  myPlayerId: string | null;
  enabled: boolean;
  onSend: (text: string) => Promise<string | null>;
  compact?: boolean;
  /** 입력을 막았을 때 입력창 안내 */
  disabledHint?: string;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);

  // 새 메시지가 오면 맨 아래로 — 길이가 아니라 마지막 메시지로 본다(최근 50개로 잘린 뒤에는 길이가 그대로라 스크롤이 멈춘다)
  const lastKey = messages.at(-1)?.key;
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lastKey]);

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
    <section
      className={
        compact
          ? "border-t border-slate-800 bg-slate-950/80 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2"
          : "rounded-3xl border border-slate-700/50 bg-slate-800/50 p-4"
      }
      aria-labelledby="battle-chat"
    >
      <h2 id="battle-chat" className={compact ? "sr-only" : "text-sm font-semibold text-white"}>
        채팅
      </h2>
      <ol
        ref={listRef}
        className={`flex min-w-0 flex-col gap-1 overflow-y-auto text-sm ${compact ? "h-20" : "mt-2 h-40"}`}
        aria-live="polite"
      >
        {messages.length === 0 && <li className="text-xs text-slate-500">입장한 뒤의 대화만 보여요.</li>}
        {messages.map((m) => (
          <li key={m.key} className="break-words">
            <span className={`font-semibold ${m.playerId === myPlayerId ? "text-sky-300" : "text-slate-300"}`}>{m.name}</span>{" "}
            <span className="text-slate-100">{m.text}</span>
          </li>
        ))}
      </ol>
      <form onSubmit={submit} className="mt-2 flex min-w-0 gap-2">
        <label htmlFor="battle-chat-input" className="sr-only">
          채팅 입력
        </label>
        <input
          id="battle-chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={CHAT_TEXT_MAX_LENGTH}
          disabled={!enabled}
          placeholder={enabled ? "메시지 입력" : disabledHint}
          autoComplete="off"
          enterKeyHint="send"
          className={`${baseInputStyles} min-h-11 min-w-0 flex-1 px-4 py-2`}
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
