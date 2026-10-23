"use client";

import { useEffect, useState } from "react";
import { TETRIS_BATTLE_EMOTE_IDS, type TetrisBattleEmoteId } from "@/types/tetrisBattleSocket";
import { EMOTE_LABELS } from "../lib/emotes";

/** 연타 방지 — 서버도 빈도 제한을 하지만 누르는 쪽에서 먼저 막는다 */
const EMOTE_COOLDOWN_MS = 1000;

/** 마지막으로 보낸 시각 — 모듈에 둔다: 경기 화면은 보내면 이 줄을 닫았다 다시 열어서, 컴포넌트 상태로는 쿨다운이 풀린다 (FE-15) */
let lastSentAt = Number.NEGATIVE_INFINITY;
const coolingNow = () => Date.now() - lastSentAt < EMOTE_COOLDOWN_MS;

/** 테스트 전용 */
export function resetEmoteCooldownForTest(): void {
  lastSentAt = Number.NEGATIVE_INFINITY;
}

/**
 * 이모트 프리셋 버튼 줄 — 대기실·게임 중 공용
 */
export function EmoteBar({ onSend, compact = false }: { onSend: (id: TetrisBattleEmoteId) => void; compact?: boolean }) {
  const [coolingDown, setCoolingDown] = useState(coolingNow);

  // 남은 쿨다운이 끝나면 다시 누를 수 있게 — 화면을 떠나면 타이머도 정리한다
  useEffect(() => {
    if (!coolingDown) return;
    const timer = setTimeout(() => setCoolingDown(false), Math.max(0, EMOTE_COOLDOWN_MS - (Date.now() - lastSentAt)));
    return () => clearTimeout(timer);
  }, [coolingDown]);

  const send = (id: TetrisBattleEmoteId) => {
    if (coolingNow()) return;
    lastSentAt = Date.now();
    setCoolingDown(true);
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
