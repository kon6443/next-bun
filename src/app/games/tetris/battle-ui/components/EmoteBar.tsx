"use client";

import { useState } from "react";
import { TETRIS_BATTLE_EMOTE_IDS, type TetrisBattleEmoteId } from "@/types/tetrisBattleSocket";
import { EMOTE_LABELS } from "../lib/emotes";

/** 연타 방지 — 서버도 빈도 제한을 하지만 누르는 쪽에서 먼저 막는다 */
const EMOTE_COOLDOWN_MS = 1000;

/**
 * 이모트 프리셋 버튼 줄 — 대기실·게임 중 공용
 */
export function EmoteBar({ onSend, compact = false }: { onSend: (id: TetrisBattleEmoteId) => void; compact?: boolean }) {
  const [coolingDown, setCoolingDown] = useState(false);

  const send = (id: TetrisBattleEmoteId) => {
    if (coolingDown) return;
    setCoolingDown(true);
    setTimeout(() => setCoolingDown(false), EMOTE_COOLDOWN_MS);
    onSend(id);
  };

  return (
    <div
      className={`flex justify-center gap-2 ${compact ? "" : "border-t border-slate-800 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2"}`}
      role="group"
      aria-label="이모트 보내기"
    >
      {TETRIS_BATTLE_EMOTE_IDS.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => send(id)}
          disabled={coolingDown}
          aria-label={`이모트 ${EMOTE_LABELS[id].label}`}
          className="flex h-11 min-w-11 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-900/70 text-xl disabled:opacity-40"
        >
          {EMOTE_LABELS[id].emoji}
        </button>
      ))}
    </div>
  );
}
