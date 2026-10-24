"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { ACTION } from "../engine";
import { type PadDirection, padDirection } from "../lib/padDirection";

type GamePadProps = {
  onHoldStart: (press: number, release: number) => void;
  onHoldEnd: (press: number) => void;
  onInstant: (action: number) => void;
  /** 판이 진행 중인가 — 멈춤·카운트다운 동안 누르고 있던 방향은 진행이 시작되는 순간 다시 보낸다(터치에는 키 반복이 없다) */
  active: boolean;
};

/** 누르고 있는 동안 유지되는 방향 — ↑ 하드 드롭은 즉시 동작이라 없다 */
const HOLD: Partial<Record<PadDirection, { press: number; release: number }>> = {
  left: { press: ACTION.LEFT_PRESS, release: ACTION.LEFT_RELEASE },
  right: { press: ACTION.RIGHT_PRESS, release: ACTION.RIGHT_RELEASE },
  down: { press: ACTION.SOFT_DROP_PRESS, release: ACTION.SOFT_DROP_RELEASE },
};

/** 가로 이동을 뗀 직후 이만큼은 ↑를 새로 눌러도 하드 드롭하지 않는다 — 엄지를 굴리다 위로 닿는 실수 */
export const HARD_DROP_GUARD_MS = 100;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** 패드 전체 — 길게 누르기 콜아웃·선택·탭 하이라이트·스크롤·확대를 막는다 */
const ROOT_STYLE: CSSProperties = {
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTouchCallout: "none",
  WebkitTapHighlightColor: "transparent",
  paddingLeft: "max(16px, env(safe-area-inset-left))",
  paddingRight: "max(16px, env(safe-area-inset-right))",
  paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
};

const ARM_BASE = "absolute flex items-center justify-center text-lg font-bold text-slate-200 transition-colors";
const ARM_IDLE = "bg-slate-800/90";
const ARM_ON = "bg-sky-500/60 text-white";

/**
 * 모바일 패드 (games-polish P9, "게임보이형") — 싱글·대전 공통
 * - 왼쪽 십자 패드: 한 터치 영역에서 각도로 4방향(lib/padDirection). 미끄러지면 떼기→누르기로 바뀐다
 *   ←→ 이동(키보드와 같은 DAS/ARR 경로) · ↓ 누르는 동안 소프트 드롭 · ↑ 하드 드롭은 새로 누를 때만(미끄러져 들어오면 무시)
 * - 오른쪽: A ⟳ 시계(위) · B ⟲ 반시계(왼쪽 아래) · HOLD 알약(A 위) — 누르는 순간 1회, 미끄러져 들어와도 동작하지 않는다
 * - 한 손가락만 패드를 맡고(두 번째 손가락은 무시), 뗌·취소·캡처 잃음·창 숨김·blur에서 모두 뗀다
 * - 가로 화면에서는 판 위에 겹쳐 좌우 끝으로 갈라진다(판 높이를 먹지 않게) — 부모가 relative여야 한다
 */
export function GamePad({ onHoldStart, onHoldEnd, onInstant, active }: GamePadProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<number | null>(null);
  const dirRef = useRef<PadDirection | null>(null);
  const lastHorizontalEndRef = useRef(-Infinity);
  const callbacksRef = useRef({ onHoldStart, onHoldEnd, onInstant });
  callbacksRef.current = { onHoldStart, onHoldEnd, onInstant };
  /** 화면 표시만 — 입력은 위 ref와 콜백으로 바로 간다(React 상태를 거치지 않는다) */
  const [shown, setShown] = useState<PadDirection | null>(null);

  /** 방향 바꾸기 — fresh: 새로 누른 순간(↑ 하드 드롭은 이때만) */
  const setDirection = useCallback((next: PadDirection | null, fresh: boolean) => {
    const prev = dirRef.current;
    if (prev === next) return;
    const { onHoldStart: start, onHoldEnd: end, onInstant: instant } = callbacksRef.current;
    const prevHold = prev ? HOLD[prev] : undefined;
    if (prevHold) {
      end(prevHold.press);
      if (prev === "left" || prev === "right") lastHorizontalEndRef.current = now();
    }
    dirRef.current = next;
    const nextHold = next ? HOLD[next] : undefined;
    if (nextHold) start(nextHold.press, nextHold.release);
    const drop = next === "up" && fresh && now() - lastHorizontalEndRef.current >= HARD_DROP_GUARD_MS;
    if (drop) instant(ACTION.HARD_DROP);
    // 미끄러져 들어온 ↑는 아무 일도 하지 않으니 밝히지 않는다
    setShown(next === "up" && !drop ? null : next);
  }, []);

  const directionAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const half = Math.min(rect.width, rect.height) / 2 || 1;
    return padDirection((e.clientX - (rect.left + rect.width / 2)) / half, (e.clientY - (rect.top + rect.height / 2)) / half, dirRef.current);
  };

  const releasePad = useCallback(() => {
    pointerRef.current = null;
    setDirection(null, false);
  }, [setDirection]);

  // 진행이 시작·재개되는 순간 누르고 있던 방향을 다시 보낸다 — 멈춘 동안의 누름은 입력 큐가 받지 않았다
  useEffect(() => {
    if (!active) return;
    const hold = dirRef.current ? HOLD[dirRef.current] : undefined;
    if (hold) callbacksRef.current.onHoldStart(hold.press, hold.release);
  }, [active]);

  // 앱 전환·화면 숨김·창 blur — 손을 뗐다는 신호가 안 올 수 있으니 패드를 놓는다. 사라질 때도
  useEffect(() => {
    const onHidden = () => {
      if (document.hidden) releasePad();
    };
    window.addEventListener("blur", releasePad);
    window.addEventListener("pagehide", releasePad);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("blur", releasePad);
      window.removeEventListener("pagehide", releasePad);
      document.removeEventListener("visibilitychange", onHidden);
      releasePad();
    };
  }, [releasePad]);

  /** 키보드·스위치·스크린리더 누름 — 포인터 없이 click만 온다(detail 0). 이동·소프트 드롭은 한 칸, ↑는 하드 드롭 */
  const keyboardArm = (dir: PadDirection) => (e: React.MouseEvent) => {
    if (e.detail !== 0) return;
    const hold = HOLD[dir];
    if (hold) {
      onHoldStart(hold.press, hold.release);
      onHoldEnd(hold.press);
    } else {
      onInstant(ACTION.HARD_DROP);
    }
  };

  const arm = (dir: PadDirection, label: string, aria: string, position: string, tone = "") => (
    <button
      type="button"
      aria-label={aria}
      // 누른 방향 표시는 화면용 — 순간 동작이라 토글(aria-pressed)로 읽히지 않게
      data-pressed={shown === dir}
      onClick={keyboardArm(dir)}
      className={`${ARM_BASE} ${position} ${shown === dir ? ARM_ON : ARM_IDLE} ${tone}`}
    >
      <span aria-hidden="true">{label}</span>
    </button>
  );

  const actionButton = (action: number, aria: string, className: string, content: React.ReactNode) => (
    <button
      type="button"
      aria-label={aria}
      className={`absolute flex items-center justify-center border font-bold text-slate-100 shadow-[0_8px_20px_rgba(2,6,23,0.5)] active:border-sky-300/60 active:bg-sky-500/40 ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        onInstant(action);
      }}
      // 키보드(Enter·Space)·보조기기의 누름은 포인터 이벤트 없이 click만 온다(detail 0)
      onClick={(e) => {
        if (e.detail === 0) onInstant(action);
      }}
    >
      {content}
    </button>
  );

  return (
    <div
      data-testid="game-pad"
      className="pointer-events-none flex w-full shrink-0 items-end justify-between gap-3 pt-2 landscape:absolute landscape:inset-x-0 landscape:bottom-0"
      style={ROOT_STYLE}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 십자 패드 — 판정은 이 영역 전체(팔 사이 모서리를 눌러도 가까운 방향으로) */}
      <div
        ref={padRef}
        role="group"
        aria-label="방향"
        data-testid="game-pad-dpad"
        className="pointer-events-auto relative aspect-square w-[clamp(140px,40vw,164px)] shrink-0 landscape:w-[clamp(120px,38vh,156px)]"
        onPointerDown={(e) => {
          if (pointerRef.current !== null) return; // 두 번째 손가락은 패드를 맡지 않는다
          e.preventDefault();
          pointerRef.current = e.pointerId;
          try {
            e.currentTarget.setPointerCapture?.(e.pointerId);
          } catch {
            // 활성 포인터가 아닌 합성 이벤트 등 — 캡처 없이도 이 포인터의 up·cancel이 패드를 놓는다
          }
          setDirection(directionAt(e), true);
        }}
        onPointerMove={(e) => {
          if (e.pointerId !== pointerRef.current) return;
          setDirection(directionAt(e), false);
        }}
        onPointerUp={(e) => {
          if (e.pointerId === pointerRef.current) releasePad();
        }}
        onPointerCancel={(e) => {
          if (e.pointerId === pointerRef.current) releasePad();
        }}
        onLostPointerCapture={(e) => {
          if (e.pointerId === pointerRef.current) releasePad();
        }}
      >
        {/* 가운데 — 팔이 한 몸인 십자 */}
        <span aria-hidden="true" className="absolute left-1/3 top-1/3 h-1/3 w-1/3 bg-slate-800/90" />
        {arm("up", "▲", "하드 드롭", "left-1/3 top-0 h-1/3 w-1/3 rounded-t-xl", shown === "up" ? "" : "text-rose-200")}
        {arm("left", "◀", "왼쪽 이동", "left-0 top-1/3 h-1/3 w-1/3 rounded-l-xl")}
        {arm("right", "▶", "오른쪽 이동", "right-0 top-1/3 h-1/3 w-1/3 rounded-r-xl")}
        {arm("down", "▼", "소프트 드롭", "bottom-0 left-1/3 h-1/3 w-1/3 rounded-b-xl")}
      </div>

      {/* 오른쪽 — A(시계)가 위·오른쪽, B(반시계)가 왼쪽 아래 25°, HOLD는 A 위. 크기 --d = 버튼 지름 */}
      <div
        role="group"
        aria-label="회전·홀드"
        className="pointer-events-auto relative shrink-0 [--d:clamp(58px,18vw,76px)] landscape:[--d:clamp(52px,17vh,72px)]"
        style={{ width: "calc(var(--d) * 2.13)", height: "calc(var(--d) * 1.53 + 64px)" }}
      >
        {actionButton(
          ACTION.HOLD,
          "홀드",
          "right-0 top-0 h-12 w-[var(--d)] rounded-full border-white/15 bg-slate-700/80 text-xs tracking-wide",
          "HOLD",
        )}
        {actionButton(
          ACTION.ROTATE_CW,
          "시계 방향 회전 (A)",
          "right-0 top-16 h-[var(--d)] w-[var(--d)] rounded-full border-sky-300/30 bg-sky-900/70",
          <RotateLabel arrow="↻" letter="A" />,
        )}
        {actionButton(
          ACTION.ROTATE_CCW,
          "반시계 방향 회전 (B)",
          "bottom-0 left-0 h-[var(--d)] w-[var(--d)] rounded-full border-white/15 bg-slate-800/80",
          <RotateLabel arrow="↺" letter="B" />,
        )}
      </div>
    </div>
  );
}

function RotateLabel({ arrow, letter }: { arrow: string; letter: string }) {
  return (
    <span aria-hidden="true" className="relative flex h-full w-full items-center justify-center">
      <span className="text-2xl leading-none">{arrow}</span>
      <span className="absolute bottom-1.5 text-[10px] font-semibold text-slate-300">{letter}</span>
    </span>
  );
}
