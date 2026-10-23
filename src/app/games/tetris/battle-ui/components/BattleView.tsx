"use client";

import { useEffect, useRef, useState } from "react";
import { BOARD_COLS, BOARD_VISIBLE_ROWS } from "@/types/tetrisBattleSocket";
import type { TetrisBattleEmoteId } from "@/types/tetrisBattleSocket";
import { TetrisCanvas } from "../../components/TetrisCanvas";
import { TouchControls } from "../../components/TouchControls";
import { SoundToggle } from "../../components/SoundToggle";
import type { ReceivedEmote } from "../contexts/BattleSocketContext";
import type { useBattlePlay } from "../hooks/useBattlePlay";
import { EmoteBar } from "./EmoteBar";
import { EmoteBubble } from "./EmoteBubble";
import { MiniBoard, type MiniBoardProps } from "./MiniBoard";
import { useBoardFocus } from "../hooks/useBoardFocus";

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
  /** 상대 판을 눌러 크게 볼 수 있다 — 내 판이 끝났을 때만(관전) */
  canEnlarge?: boolean;
  /** 판 아래 줄 — 관전 중 채팅 (터치 버튼은 경기 중에만 보이므로 자리가 겹치지 않는다) */
  footer?: React.ReactNode;
  /**
   * 카운트다운 — 터치 버튼 자리를 미리 잡는다. 시작 순간 버튼이 생기며 판이 줄어들지(캔버스 재할당) 않게 (games-polish FE-11)
   * 시작 전 누름은 useBattlePlay가 무시한다
   */
  reserveControls?: boolean;
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

/** 크게 본 상대 판 — 들어갈 자리에 맞춰 칸 크기를 정한다(좁은 세로 화면에서 넘치지 않게) */
function EnlargedBoard({ opponent }: { opponent: OpponentView }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState(0);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => {
      // 캡션 한 줄(약 20px)을 뺀 높이와 폭에 맞는 정수 칸
      const next = Math.floor(Math.min(box.clientWidth / BOARD_COLS, (box.clientHeight - 20) / BOARD_VISIBLE_ROWS));
      setCell(Math.max(4, next));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={boxRef} className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden">
      {cell > 0 && <MiniBoard {...opponent} cell={cell} anchor={false} />}
    </div>
  );
}

/**
 * 대전 화면 — 위: 상대 미니보드 띠(대상 테두리·탈락·KO·가비지) / 가운데: 내 판(왼쪽 가비지 게이지) / 아래: 터치 버튼
 */
export function BattleView({
  play,
  meId,
  opponents,
  emotes,
  trailsRootRef,
  onEmote,
  onExit,
  overlay,
  canEnlarge = false,
  footer,
  reserveControls = false,
}: BattleViewProps) {
  const [isCoarse, setIsCoarse] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const miniCell = useMiniCell(opponents.length);
  const focus = useBoardFocus(canEnlarge);
  const enlarged = opponents.find((o) => o.playerId === focus.focusedId) ?? null;

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
              <div
                {...focus.boardProps(o.playerId, o.name)}
                className={`rounded-lg ${canEnlarge ? "cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400" : ""} ${
                  enlarged?.playerId === o.playerId ? "ring-2 ring-sky-400/70" : ""
                }`}
              >
                <MiniBoard {...o} cell={miniCell} />
              </div>
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
        {enlarged && (
          // 내 판(이미 끝남) 위를 덮는다 — 공격 궤적 기준점(data-attack-anchor)은 위 띠의 작은 판이 그대로 맡는다
          <div className="absolute inset-0 z-10 flex flex-col gap-2 bg-slate-950/90 p-2">
            <button
              ref={focus.backRef}
              type="button"
              onClick={focus.close}
              className="flex min-h-11 items-center self-start rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-xs text-slate-300 hover:text-white"
            >
              ← 내 화면으로
            </button>
            <EnlargedBoard opponent={enlarged} />
          </div>
        )}
      </div>

      {isCoarse && (play.status === "playing" || reserveControls) && (
        <TouchControls onHoldStart={play.press} onHoldEnd={play.release} onInstant={play.instant} />
      )}
      {footer}
    </div>
  );
}
