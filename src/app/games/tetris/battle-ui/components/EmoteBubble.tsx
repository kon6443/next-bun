"use client";

import { useEffect, useState } from "react";
import type { TetrisBattleEmoteId } from "@/types/tetrisBattleSocket";
import { EMOTE_LABELS, EMOTE_SHOW_MS } from "../lib/emotes";

/** 받은 이모트를 잠깐 보여 준다 — 같은 이모트를 다시 받아도 key가 바뀌어 다시 뜬다 */
export function EmoteBubble({ emote }: { emote: { emoteId: TetrisBattleEmoteId; key: number } | undefined }) {
  const [visibleKey, setVisibleKey] = useState<number | null>(null);
  useEffect(() => {
    if (!emote) return;
    setVisibleKey(emote.key);
    const timer = setTimeout(() => setVisibleKey(null), EMOTE_SHOW_MS);
    return () => clearTimeout(timer);
  }, [emote]);
  if (!emote || visibleKey !== emote.key) return null;
  const label = EMOTE_LABELS[emote.emoteId];
  return (
    <span
      className="pointer-events-none absolute -top-3 right-2 whitespace-nowrap rounded-full border border-white/15 bg-slate-950/90 px-2 py-1 text-sm shadow-[0_6px_16px_rgba(2,6,23,0.6)]"
      role="status"
    >
      {label.emoji} <span className="text-xs text-slate-200">{label.label}</span>
    </span>
  );
}
