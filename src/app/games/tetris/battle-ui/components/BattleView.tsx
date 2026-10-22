"use client";

import { useEffect, useState } from "react";
import type { TetrisBattleEmoteId } from "@/types/tetrisBattleSocket";
import { TetrisCanvas } from "../../components/TetrisCanvas";
import { TouchControls } from "../../components/TouchControls";
import { SoundToggle } from "../../components/SoundToggle";
import type { ReceivedEmote } from "../contexts/BattleSocketContext";
import type { useBattlePlay } from "../hooks/useBattlePlay";
import { EmoteBar } from "./EmoteBar";
import { EmoteBubble } from "./EmoteBubble";
import { MiniBoard, type MiniBoardProps } from "./MiniBoard";

export type OpponentView = Omit<MiniBoardProps, "cell">;

type BattleViewProps = {
  play: ReturnType<typeof useBattlePlay>;
  /** 내 판의 공격 궤적 기준점 id (= 내 playerId) */
  meId: string;
  opponents: OpponentView[];
  emotes: Record<string, ReceivedEmote>;
  /** 공격 궤적 레이어 루트 — useAttackTrails의 rootRef */
  trailsRootRef: React.RefObject<HTMLDivElement | null>;
  onEmote: (id: TetrisBattleEmoteId) => void;
  onExit: () => void;
  /** 판 위 덮개(카운트다운·탈락·결과) */
  overlay?: React.ReactNode;
};

/** 상대 수·화면 폭 → 미니보드 칸 크기 (DESIGN §7: 2인전은 크게, 3~4인전은 작게) */
function useMiniCell(opponentCount: number): number {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    setWide(media.matches);
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  if (opponentCount <= 1) return wide ? 10 : 6;
  return wide ? 8 : 4;
}

/**
 * 대전 화면 — 위: 상대 미니보드 띠(대상 테두리·탈락·KO·가비지) / 가운데: 내 판(왼쪽 가비지 게이지) / 아래: 터치 버튼
 */
export function BattleView({ play, meId, opponents, emotes, trailsRootRef, onEmote, onExit, overlay }: BattleViewProps) {
  const [isCoarse, setIsCoarse] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const miniCell = useMiniCell(opponents.length);

  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse)");
    setIsCoarse(media.matches);
    const onChange = (e: MediaQueryListEvent) => setIsCoarse(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return (
    <div ref={trailsRootRef} className="relative flex h-full flex-col pt-[env(safe-area-inset-top)]">
      <header className="flex items-start gap-2 px-2 pt-2">
        <button
          type="button"
          onClick={onExit}
          aria-label="나가기"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-900/70 text-slate-400"
        >
          ←
        </button>
        <ul className="flex min-w-0 flex-1 justify-center gap-3" aria-label="상대">
          {opponents.map((o) => (
            <li key={o.playerId} className="relative">
              <MiniBoard {...o} cell={miniCell} />
              <EmoteBubble emote={emotes[o.playerId]} />
            </li>
          ))}
        </ul>
        <SoundToggle className="shrink-0" />
        <button
          type="button"
          onClick={() => setEmoteOpen((v) => !v)}
          aria-expanded={emoteOpen}
          aria-label="이모트"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-900/70 text-xl"
        >
          😀
        </button>
      </header>
      {emoteOpen && (
        <div className="absolute right-2 top-[calc(env(safe-area-inset-top)+3.5rem)] z-20 rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-[0_12px_30px_rgba(2,6,23,0.7)]">
          <EmoteBar
            compact
            onSend={(id) => {
              setEmoteOpen(false);
              onEmote(id);
            }}
          />
        </div>
      )}

      {/* 루트 layout이 이미 <main>으로 감싼다 — 중첩하지 않는다 */}
      <div className="relative min-h-0 flex-1" data-attack-anchor={meId}>
        <TetrisCanvas stateRef={play.gameRef} drawRef={play.afterTickRef} effectsRef={play.effectsRef} garbageRef={play.garbageRef} />
        <div className="pointer-events-none absolute left-2 top-4 h-8 w-32">
          <EmoteBubble emote={emotes[meId]} />
        </div>
        {overlay}
      </div>

      {isCoarse && play.status === "playing" && (
        <TouchControls onHoldStart={play.press} onHoldEnd={play.release} onInstant={play.instant} />
      )}
    </div>
  );
}
