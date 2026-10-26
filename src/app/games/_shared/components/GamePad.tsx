"use client";

import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { type PadDirection, padDirection } from "../lib/padDirection";

/**
 * 게임 공통 모바일 패드 (games-polish P9) — 게임 무관 프리미티브. 게임은 배치(GamePadLayout)만 정한다
 * - 왼쪽 십자 패드: 한 터치 영역 + 각도 판정(lib/padDirection). 미끄러지면 떼기→누르기로 바뀐다. 배치에 없는 방향은 무동작(흐리게)
 *   유지형 방향은 누르는 동안, 즉시형 방향은 새로 누를 때만(미끄러져 들어오면 무시, 유지형 방향을 뗀 직후 GUARD 안은 무시)
 * - 왼쪽 위 어깨 버튼(L)·오른쪽 버튼들: 슬롯에 놓인다. 즉시형은 누르는 순간 1회, 유지형은 누르는 동안. 미끄러져 들어와도 동작하지 않는다
 * - 한 손가락만 십자 패드를 맡고(두 번째 무시), 뗌·취소·캡처 잃음·창 숨김·pagehide·blur·언마운트에서 모두 뗀다
 * - active가 true가 되는 순간 누르고 있던 유지형 입력을 다시 보낸다(멈춤·카운트다운 동안 게임이 받지 않았다 — 터치에는 키 반복이 없다)
 * - 가로 화면에서는 부모(relative) 위에 겹쳐 좌우 끝으로 갈라진다(판 높이를 먹지 않게)
 */

/** 누르는 동안 유지(press → release 코드) 또는 누르는 순간 1회 */
export type PadAction = { kind: "hold"; press: number; release: number } | { kind: "instant"; action: number };

export type PadDirectionSpec = { action: PadAction; aria: string; label: string };

/** 오른쪽: top = A·B 위 넓은 버튼, a = 위·오른쪽 큰 원, b = 왼쪽 아래 원 · 왼쪽: shoulder = 십자 패드 위 알약 */
export type PadSlot = "top" | "a" | "b" | "shoulder";

export type PadButtonSpec = {
  id: string;
  slot: PadSlot;
  action: PadAction;
  aria: string;
  content: ReactNode;
  /** 색 — neutral(기본) · primary(주 동작) · accent(되돌릴 수 없는 동작 — 강조색) */
  tone?: "neutral" | "primary" | "accent";
};

/**
 * 배치 불변 조건: 유지형(hold) press 코드는 배치 안에서 하나씩만 — 입력 큐는 press 코드당 눌림 하나를 추적해서,
 * 같은 코드를 두 곳(방향·버튼)에 두면 한쪽을 뗄 때 다른 쪽이 눌린 채여도 풀린다
 */
export type GamePadLayout = {
  /**
   * 없는 방향은 무동작 — 누르거나 미끄러져 들어가도 입력 없음, 팔은 흐리게
   * ↑이 없으면 위 팔 자리를 아예 두지 않는 T자(높이 2/3) — 판정은 위 1/3을 잘라 낸 정사각형 그대로(←→↓ 영역이 같다)
   */
  dpad: Partial<Record<PadDirection, PadDirectionSpec>>;
  buttons: readonly PadButtonSpec[];
};

type GamePadProps = {
  layout: GamePadLayout;
  onHoldStart: (press: number, release: number) => void;
  onHoldEnd: (press: number) => void;
  onInstant: (action: number) => void;
  /** 게임이 입력을 받는 중인가 */
  active: boolean;
};

/** 유지형 방향을 뗀 직후 이만큼은 즉시형 방향을 새로 눌러도 무시 — 엄지를 굴리다 닿는 실수 */
export const PAD_INSTANT_GUARD_MS = 100;

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

const TONES = {
  neutral: "border-white/15 bg-slate-800/80 text-slate-100",
  primary: "border-sky-300/30 bg-sky-900/70 text-slate-100",
  accent: "border-rose-300/50 bg-rose-600/80 text-white",
} as const;

/** 슬롯 자리 — 오른쪽 묶음은 --d(원 지름) 기준: top 48px + 틈 12px 아래에 A(위·오른쪽), B는 A의 왼쪽 아래 25° */
const SLOT_CLASS: Record<PadSlot, string> = {
  top: "right-0 top-0 h-12 w-full rounded-2xl text-sm",
  a: "right-0 top-[60px] h-[var(--d)] w-[var(--d)] rounded-full",
  b: "bottom-0 left-0 h-[var(--d)] w-[var(--d)] rounded-full",
  shoulder: "left-1/2 top-0 h-12 w-[64%] -translate-x-1/2 rounded-full text-xs tracking-wide",
};

/** top 버튼이 없으면 A는 묶음 맨 위 */
const SLOT_A_WITHOUT_TOP = "right-0 top-0 h-[var(--d)] w-[var(--d)] rounded-full";

const ARM_POSITION: Record<PadDirection, string> = {
  up: "left-1/3 top-0 h-1/3 w-1/3 rounded-t-xl",
  left: "left-0 top-1/3 h-1/3 w-1/3 rounded-l-xl",
  right: "right-0 top-1/3 h-1/3 w-1/3 rounded-r-xl",
  down: "bottom-0 left-1/3 h-1/3 w-1/3 rounded-b-xl",
};
/** T자(↑ 없음) — 높이가 폭의 2/3이라 한 줄 = 높이의 1/2 */
const ARM_POSITION_TEE: Record<Exclude<PadDirection, "up">, string> = {
  left: "left-0 top-0 h-1/2 w-1/3 rounded-l-xl",
  right: "right-0 top-0 h-1/2 w-1/3 rounded-r-xl",
  down: "bottom-0 left-1/3 h-1/2 w-1/3 rounded-b-xl",
};
const DIRECTIONS: readonly PadDirection[] = ["up", "left", "right", "down"];

export function GamePad({ layout, onHoldStart, onHoldEnd, onInstant, active }: GamePadProps) {
  const pointerRef = useRef<number | null>(null);
  const dirRef = useRef<PadDirection | null>(null);
  const lastHoldEndRef = useRef(-Infinity);
  /** 누르고 있는 유지형 버튼: pointerId → 누름 코드 */
  const heldButtonsRef = useRef(new Map<number, { press: number; release: number }>());
  const latestRef = useRef({ layout, onHoldStart, onHoldEnd, onInstant });
  latestRef.current = { layout, onHoldStart, onHoldEnd, onInstant };
  /** 화면 표시만 — 입력은 ref와 콜백으로 바로 간다(React 상태를 거치지 않는다) */
  const [shown, setShown] = useState<PadDirection | null>(null);

  /** 십자 방향 바꾸기 — fresh: 새로 누른 순간(즉시형 방향은 이때만). 배치에 없는 방향은 무동작 */
  const setDirection = useCallback((raw: PadDirection | null, fresh: boolean) => {
    const { layout: current, onHoldStart: start, onHoldEnd: end, onInstant: instant } = latestRef.current;
    const next = raw && current.dpad[raw] ? raw : null;
    const prev = dirRef.current;
    if (prev === next) return;
    const prevAction = prev ? current.dpad[prev]?.action : undefined;
    if (prevAction?.kind === "hold") {
      end(prevAction.press);
      lastHoldEndRef.current = now();
    }
    dirRef.current = next;
    const nextAction = next ? current.dpad[next]?.action : undefined;
    let lit = next;
    if (nextAction?.kind === "hold") start(nextAction.press, nextAction.release);
    else if (nextAction?.kind === "instant") {
      // 즉시형은 새로 누를 때만 — 미끄러져 들어오거나 유지형을 막 뗐으면 아무 일도 하지 않으니 밝히지도 않는다
      if (fresh && now() - lastHoldEndRef.current >= PAD_INSTANT_GUARD_MS) instant(nextAction.action);
      else lit = null;
    }
    setShown(lit);
  }, []);

  const directionAt = (e: React.PointerEvent<HTMLDivElement>) => {
    // 중심·반지름은 폭으로 — 정사각형은 요소 중심, T자는 위 1/3이 잘린 정사각형의 중심(아래에서 폭의 절반)
    const rect = e.currentTarget.getBoundingClientRect();
    const half = rect.width / 2 || 1;
    return padDirection((e.clientX - (rect.left + half)) / half, (e.clientY - (rect.bottom - half)) / half, dirRef.current);
  };

  /** 십자 패드를 맡은 손가락이 떨어졌다(뗌·취소·캡처 잃음) */
  const endDpad = (pointerId: number) => {
    if (pointerId !== pointerRef.current) return;
    pointerRef.current = null;
    setDirection(null, false);
  };

  const releaseAll = useCallback(() => {
    pointerRef.current = null;
    setDirection(null, false);
    const held = heldButtonsRef.current;
    for (const hold of held.values()) latestRef.current.onHoldEnd(hold.press);
    held.clear();
  }, [setDirection]);

  // 진행이 시작·재개되는 순간 누르고 있던 유지형 입력을 다시 보낸다
  useEffect(() => {
    if (!active) return;
    const { layout: current, onHoldStart: start } = latestRef.current;
    const dirAction = dirRef.current ? current.dpad[dirRef.current]?.action : undefined;
    if (dirAction?.kind === "hold") start(dirAction.press, dirAction.release);
    for (const hold of heldButtonsRef.current.values()) start(hold.press, hold.release);
  }, [active]);

  // 앱 전환·화면 숨김·창 blur — 손을 뗐다는 신호가 안 올 수 있으니 모두 놓는다. 사라질 때도
  useEffect(() => {
    const onHidden = () => {
      if (document.hidden) releaseAll();
    };
    window.addEventListener("blur", releaseAll);
    window.addEventListener("pagehide", releaseAll);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("blur", releaseAll);
      window.removeEventListener("pagehide", releaseAll);
      document.removeEventListener("visibilitychange", onHidden);
      releaseAll();
    };
  }, [releaseAll]);

  /** 키보드·스위치·스크린리더 누름 — 포인터 없이 click만 온다(detail 0). 유지형은 누르고 바로 떼 한 번, 즉시형은 1회 */
  const keyboardPress = (action: PadAction) => (e: React.MouseEvent) => {
    if (e.detail !== 0) return;
    if (action.kind === "hold") {
      onHoldStart(action.press, action.release);
      onHoldEnd(action.press);
    } else {
      onInstant(action.action);
    }
  };

  const button = (spec: PadButtonSpec, slotClass = SLOT_CLASS[spec.slot]) => {
    const { action } = spec;
    const endHold = (pointerId: number) => {
      const hold = heldButtonsRef.current.get(pointerId);
      if (!hold) return;
      heldButtonsRef.current.delete(pointerId);
      onHoldEnd(hold.press);
    };
    return (
      <button
        key={spec.id}
        type="button"
        aria-label={spec.aria}
        data-testid={`pad-${spec.id}`}
        className={`pointer-events-auto absolute flex items-center justify-center border font-bold shadow-[0_8px_20px_rgba(2,6,23,0.5)] active:brightness-125 ${TONES[spec.tone ?? "neutral"]} ${slotClass}`}
        onPointerDown={(e) => {
          e.preventDefault();
          if (action.kind === "instant") {
            onInstant(action.action);
            return;
          }
          try {
            e.currentTarget.setPointerCapture?.(e.pointerId);
          } catch {
            // 캡처 없이도 이 포인터의 up·cancel이 뗀다
          }
          heldButtonsRef.current.set(e.pointerId, { press: action.press, release: action.release });
          onHoldStart(action.press, action.release);
        }}
        onPointerUp={(e) => endHold(e.pointerId)}
        onPointerCancel={(e) => endHold(e.pointerId)}
        onLostPointerCapture={(e) => endHold(e.pointerId)}
        onClick={keyboardPress(action)}
      >
        {spec.content}
      </button>
    );
  };

  /**
   * 십자 패드의 길게 누르기 제스처(iOS 선택·확대경·"복사하기" 콜아웃, Android 롱프레스)를 끈다 — iOS는 터치 롱프레스에 contextmenu를 보내지 않아
   * CSS 힌트(user-select·-webkit-touch-callout)·onContextMenu로는 못 막는다. React onTouchStart는 passive라 직접 passive: false로 붙인다
   * 십자 입력은 pointer 이벤트로 처리한다(touchstart를 취소해도 pointer는 그대로 온다)
   * 범위는 십자만 — 길게 누르는 조작은 ←→↓(유지형)뿐이고, 오른쪽·어깨 버튼(즉시형 탭)은 터치 취소가 :active 눌림 표시를 끌 수 있어 두지 않는다
   */
  const dpadRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = dpadRef.current;
    if (!root) return;
    const block = (e: Event) => {
      if (e.cancelable) e.preventDefault();
    };
    root.addEventListener("touchstart", block, { passive: false });
    return () => root.removeEventListener("touchstart", block);
  }, []);

  const shoulder = layout.buttons.filter((b) => b.slot === "shoulder");
  const right = layout.buttons.filter((b) => b.slot !== "shoulder");
  const hasTop = right.some((b) => b.slot === "top");
  const tee = !layout.dpad.up;

  return (
    <div
      data-testid="game-pad"
      className="pointer-events-none flex w-full shrink-0 items-end justify-between gap-3 pt-2 landscape:absolute landscape:inset-x-0 landscape:bottom-0"
      style={ROOT_STYLE}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 왼쪽 — 어깨 버튼(있으면) 아래 십자 패드 */}
      <div className="relative flex shrink-0 flex-col items-center gap-3">
        {shoulder.length > 0 && <div className="relative h-12 w-full">{shoulder.map((spec) => button(spec))}</div>}
        {/* 십자 패드 — 판정은 이 영역 전체(팔 사이 모서리를 눌러도 가까운 방향으로) */}
        <div
          ref={dpadRef}
          role="group"
          aria-label="방향"
          data-testid="game-pad-dpad"
          className={`pointer-events-auto relative w-[clamp(132px,38vw,160px)] landscape:w-[clamp(112px,34vh,150px)] ${tee ? "aspect-[3/2]" : "aspect-square"}`}
          onPointerDown={(e) => {
            if (pointerRef.current !== null) return; // 두 번째 손가락은 십자 패드를 맡지 않는다
            e.preventDefault();
            pointerRef.current = e.pointerId;
            try {
              e.currentTarget.setPointerCapture?.(e.pointerId);
            } catch {
              // 활성 포인터가 아닌 합성 이벤트 등 — 캡처 없이도 이 포인터의 up·cancel이 놓는다
            }
            setDirection(directionAt(e), true);
          }}
          onPointerMove={(e) => {
            if (e.pointerId !== pointerRef.current) return;
            setDirection(directionAt(e), false);
          }}
          onPointerUp={(e) => endDpad(e.pointerId)}
          onPointerCancel={(e) => endDpad(e.pointerId)}
          onLostPointerCapture={(e) => endDpad(e.pointerId)}
        >
          <span aria-hidden="true" className={`absolute left-1/3 w-1/3 bg-slate-800/90 ${tee ? "top-0 h-1/2" : "top-1/3 h-1/3"}`} />
          {DIRECTIONS.map((dir) => {
            if (tee && dir === "up") return null;
            const position = tee && dir !== "up" ? ARM_POSITION_TEE[dir] : ARM_POSITION[dir];
            const spec = layout.dpad[dir];
            // 무동작 방향 — 누르는 키가 아님이 보이게 흐린 팔만(버튼·라벨 없음)
            if (!spec) return <span key={dir} aria-hidden="true" data-testid={`pad-arm-${dir}-off`} className={`absolute bg-slate-800/40 ${position}`} />;
            return (
              <button
                key={dir}
                type="button"
                aria-label={spec.aria}
                // 누른 방향 표시는 화면용 — 순간 동작이라 토글(aria-pressed)로 읽히지 않게
                data-pressed={shown === dir}
                onClick={keyboardPress(spec.action)}
                className={`absolute flex items-center justify-center text-lg font-bold transition-colors ${position} ${shown === dir ? "bg-sky-500/60 text-white" : "bg-slate-800/90 text-slate-200"}`}
              >
                <span aria-hidden="true">{spec.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 오른쪽 — top(넓은 버튼, 48px, 있으면) 아래 A(위·오른쪽)·B(왼쪽 아래 25°). --d = 원 지름 */}
      <div
        role="group"
        aria-label="버튼"
        className="pointer-events-auto relative shrink-0 [--d:clamp(56px,17vw,72px)] landscape:[--d:clamp(50px,15vh,68px)]"
        style={{ width: "calc(var(--d) * 2.13)", height: hasTop ? "calc(var(--d) * 1.53 + 60px)" : "calc(var(--d) * 1.53)" }}
      >
        {right.map((spec) => button(spec, spec.slot === "a" && !hasTop ? SLOT_A_WITHOUT_TOP : SLOT_CLASS[spec.slot]))}
      </div>
    </div>
  );
}
