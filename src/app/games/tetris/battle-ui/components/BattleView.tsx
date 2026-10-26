"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BOARD_COLS, BOARD_VISIBLE_ROWS } from "@/types/tetrisBattleSocket";
import type { TetrisBattleEmoteId } from "@/types/tetrisBattleSocket";
import { TetrisCanvas } from "../../components/TetrisCanvas";
import { computeLayout } from "../../lib/renderer";
import type { BoardSkins } from "../../lib/skins";
import { GamePad } from "@/app/games/_shared/components/GamePad";
import { TETRIS_PAD_LAYOUT } from "../../lib/tetrisPadLayout";
import { GameSettingsButton } from "@/app/games/_shared/components/GameSettingsButton";
import { TetrisSettingsSheet } from "../../components/TetrisSettingsSheet";
import type { ReceivedEmote } from "../contexts/BattleSocketContext";
import type { useBattlePlay } from "../hooks/useBattlePlay";
import { EmoteBar } from "./EmoteBar";
import { EmoteBubble } from "./EmoteBubble";
import { MiniBoard, type MiniBoardProps } from "./MiniBoard";
import { useBoardFocus } from "../hooks/useBoardFocus";
import { useMediaQuery } from "@/app/games/_shared/hooks/useMediaQuery";

export type OpponentView = Omit<MiniBoardProps, "cell">;

type BattleViewProps = {
  play: ReturnType<typeof useBattlePlay>;
  /** 내 판의 공격 궤적 기준점 id (= 내 playerId) */
  meId: string;
  opponents: OpponentView[];
  /** 내 판의 스킨(내 장착) — 없으면 기본 */
  skins?: BoardSkins;
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

/**
 * 상대 수·화면 크기 → 미니보드 칸 크기 (DESIGN §7: 2인전은 크게, 3~4인전은 작게)
 * 큰 칸은 넓고 높이도 넉넉한 화면만 — 가로 휴대폰(폭은 넓고 높이가 낮다)에서 큰 미니보드가 헤더를 키워 판이 잘리지 않게
 */
const WIDE_MINI_QUERY = "(min-width: 640px) and (min-height: 600px)";
function useMiniCell(opponentCount: number): number {
  const wide = useMediaQuery(WIDE_MINI_QUERY);
  if (opponentCount <= 1) return wide ? 10 : 6;
  return wide ? 8 : 4;
}

/** 헤더의 나가기·소리·이모트 버튼 높이(h-11) — 미니보드가 이보다 높으면 그만큼 헤더가 커진다 */
const HEADER_BUTTON_PX = 44;
/** 미니보드 칸 밖 높이 — 테두리·안쪽 여백(6) + 캡션 줄(11) + 간격(4) */
const MINI_CHROME_PX = 21;
/** 옆 줄 폭 — 미니보드(칸×10 + 테두리·여백 6) + 좌우 여백 */
const SIDE_STRIP_PADDING_PX = 8;

/**
 * 상대 판 자리(보드 크기 A, 세로 화면) — 판 영역이 높이가 한계면(가로가 남으면) 상대 미니보드를 판 옆 세로 줄로 옮겨 헤더 높이를 판에 돌려준다
 * 폭이 한계인 화면은 헤더 배치를 그대로 둔다(옆 줄이 오히려 판을 줄인다). 가로 화면은 대상이 아니다(헤더 배치)
 * 판정은 두 배치의 셀 크기 비교 — 지금 배치에서 잰 판 영역으로 다른 배치의 영역을 계산하므로 어느 쪽에서 재도 같은 답이다(배치가 번갈아 바뀌지 않는다)
 */
function useSideStrip(rowRef: React.RefObject<HTMLDivElement | null>, opponentCount: number, miniCell: number): boolean {
  const portrait = useMediaQuery("(orientation: portrait)");
  const [side, setSide] = useState(false);
  const sideRef = useRef(side);
  sideRef.current = side;
  useEffect(() => {
    const row = rowRef.current;
    if (!row || !portrait || opponentCount === 0) {
      setSide(false);
      return;
    }
    const stripWidth = miniCell * BOARD_COLS + 6 + SIDE_STRIP_PADDING_PX;
    const headerExtra = Math.max(0, miniCell * BOARD_VISIBLE_ROWS + MINI_CHROME_PX - HEADER_BUTTON_PX);
    const decide = () => {
      const { width, height } = row.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      // 판 영역(옆 줄 제외 · 헤더 미니보드 높이 제외)을 두 배치로 맞춰 셀을 비교한다
      const [headerW, headerH, sideW, sideH] = sideRef.current
        ? [width, height - headerExtra, width - stripWidth, height]
        : [width, height, width - stripWidth, height + headerExtra];
      const next = computeLayout(sideW, sideH).cell > computeLayout(headerW, headerH).cell;
      if (next !== sideRef.current) setSide(next);
    };
    decide();
    const observer = new ResizeObserver(decide);
    observer.observe(row);
    return () => observer.disconnect();
  }, [rowRef, portrait, opponentCount, miniCell]);
  return side;
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
  skins,
  emotes,
  trailsRootRef,
  onEmote,
  onExit,
  overlay,
  canEnlarge = false,
  footer,
  reserveControls = false,
}: BattleViewProps) {
  const isCoarse = useMediaQuery("(pointer: coarse)");
  const [emoteOpen, setEmoteOpen] = useState(false);
  const emoteToggleRef = useRef<HTMLButtonElement>(null);
  const emotePanelRef = useRef<HTMLDivElement>(null);
  /** 이모트 창 닫기 — 키보드로 닫았으면 토글로 포커스를 돌려준다 */
  const closeEmotes = useCallback((returnFocus: boolean) => {
    setEmoteOpen(false);
    if (returnFocus) emoteToggleRef.current?.focus();
  }, []);
  // 열리면 첫 이모트로 포커스, Esc·바깥 누르기로 닫는다 — 판을 가린 채 남지 않게 (games-polish FE-31)
  useEffect(() => {
    if (!emoteOpen) return;
    emotePanelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closeEmotes(true);
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (emotePanelRef.current?.contains(target) || emoteToggleRef.current?.contains(target)) return;
      closeEmotes(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [emoteOpen, closeEmotes]);
  const miniCell = useMiniCell(opponents.length);
  const focus = useBoardFocus(canEnlarge);
  const enlarged = opponents.find((o) => o.playerId === focus.focusedId) ?? null;
  const boardRowRef = useRef<HTMLDivElement>(null);
  const side = useSideStrip(boardRowRef, opponents.length, miniCell);

  /** 상대 미니보드 목록 — 헤더(가로 줄) 또는 판 옆(세로 줄). 공격 궤적 기준점은 미니보드가 맡아 위치를 따라간다 */
  const opponentList = (className: string) => (
    <ul className={className} aria-label="상대" data-testid={side ? "opponents-side" : "opponents-header"}>
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
  );

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
        {side ? <div className="min-w-0 flex-1" /> : opponentList("flex min-w-0 flex-1 justify-center gap-3")}
        <GameSettingsButton className="shrink-0" renderSheet={(close) => <TetrisSettingsSheet onClose={close} controls="locked" />} />
        <button
          ref={emoteToggleRef}
          type="button"
          onClick={() => setEmoteOpen((v) => !v)}
          aria-expanded={emoteOpen}
          aria-controls="battle-emote-panel"
          aria-label="이모트"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-900/70 text-xl"
        >
          😀
        </button>
      </header>
      {emoteOpen && (
        <div
          ref={emotePanelRef}
          id="battle-emote-panel"
          className="absolute right-2 top-[calc(env(safe-area-inset-top)+3.5rem)] z-20 rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-[0_12px_30px_rgba(2,6,23,0.7)]"
        >
          <EmoteBar
            compact
            onSend={(id) => {
              closeEmotes(true);
              onEmote(id);
            }}
          />
        </div>
      )}

      {/* 루트 layout이 이미 <main>으로 감싼다 — 중첩하지 않는다 */}
      <div ref={boardRowRef} className="flex min-h-0 flex-1">
        {side && opponentList("flex shrink-0 flex-col items-center gap-2 overflow-y-auto px-1 py-2")}
        <div className="relative min-w-0 flex-1" data-attack-anchor={meId}>
          <TetrisCanvas stateRef={play.gameRef} drawRef={play.afterTickRef} effectsRef={play.effectsRef} garbageRef={play.garbageRef} skins={skins} />
          <div className="pointer-events-none absolute left-2 top-4 h-8 w-32">
            <EmoteBubble emote={emotes[meId]} />
          </div>
          {overlay}
          {enlarged && (
            // 내 판(이미 끝남) 위를 덮는다 — 공격 궤적 기준점(data-attack-anchor)은 상대 목록의 작은 판이 그대로 맡는다
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
      </div>

      {isCoarse && (play.status === "playing" || reserveControls) && (
        <GamePad layout={TETRIS_PAD_LAYOUT} onHoldStart={play.press} onHoldEnd={play.release} onInstant={play.instant} active={play.status === "playing"} />
      )}
      {footer}
    </div>
  );
}
