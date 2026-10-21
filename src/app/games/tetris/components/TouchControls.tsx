"use client";

import { ACTION } from "../engine";

type TouchControlsProps = {
  onHoldStart: (press: number, release: number) => void;
  onHoldEnd: (press: number) => void;
  onInstant: (action: number) => void;
};

type HoldButton = { press: number; release: number; label: string; aria: string };
type InstantButton = { action: number; label: string; aria: string };

const LEFT_CLUSTER: HoldButton[] = [
  { press: ACTION.LEFT_PRESS, release: ACTION.LEFT_RELEASE, label: "◀", aria: "왼쪽 이동" },
  { press: ACTION.SOFT_DROP_PRESS, release: ACTION.SOFT_DROP_RELEASE, label: "▼", aria: "소프트 드롭" },
  { press: ACTION.RIGHT_PRESS, release: ACTION.RIGHT_RELEASE, label: "▶", aria: "오른쪽 이동" },
];

const RIGHT_CLUSTER: InstantButton[] = [
  { action: ACTION.HOLD, label: "HOLD", aria: "홀드" },
  { action: ACTION.ROTATE_CCW, label: "↺", aria: "반시계 방향 회전" },
  { action: ACTION.ROTATE_CW, label: "↻", aria: "시계 방향 회전" },
  { action: ACTION.HARD_DROP, label: "⤓", aria: "하드 드롭" },
];

const buttonBase =
  "flex select-none items-center justify-center rounded-2xl border border-white/15 bg-slate-800/80 font-bold text-slate-100 shadow-[0_8px_20px_rgba(2,6,23,0.5)] active:bg-sky-500/40 active:border-sky-300/60";

/**
 * 모바일 가상 버튼 — 멀티터치(좌 이동 누른 채 회전 등). 포인터를 캡처해 손가락이 벗어나도 뗌을 놓치지 않는다
 */
export function TouchControls({ onHoldStart, onHoldEnd, onInstant }: TouchControlsProps) {
  return (
    <div
      className="flex w-full items-end justify-between gap-3 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2"
      style={{ touchAction: "none" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="grid grid-cols-3 gap-2">
        {LEFT_CLUSTER.map((b) => (
          <button
            key={b.press}
            type="button"
            aria-label={b.aria}
            className={`${buttonBase} h-[clamp(52px,15vw,64px)] w-[clamp(52px,15vw,64px)] text-xl`}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              onHoldStart(b.press, b.release);
            }}
            onPointerUp={() => onHoldEnd(b.press)}
            onPointerCancel={() => onHoldEnd(b.press)}
            onLostPointerCapture={() => onHoldEnd(b.press)}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {RIGHT_CLUSTER.map((b) => (
          <button
            key={b.action}
            type="button"
            aria-label={b.aria}
            className={`${buttonBase} h-[clamp(48px,13vw,58px)] w-[clamp(56px,17vw,72px)] ${b.label.length > 2 ? "text-xs" : "text-2xl"}`}
            onPointerDown={(e) => {
              e.preventDefault();
              onInstant(b.action);
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
