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

/**
 * 오른쪽 묶음 (D-018) — 아래 줄(엄지가 쉬는 자리)에 큰 회전 두 개, 위 줄은 간격을 띄워 홀드(엄지 쪽)·하드 드롭(먼 쪽)
 * 하드 드롭은 회전 바로 옆에서 떼어 냈다 — 회전하려다 즉시 떨어뜨리는 실수를 줄인다
 */
const TOP_ROW: InstantButton[] = [
  { action: ACTION.HARD_DROP, label: "⤓", aria: "하드 드롭" },
  { action: ACTION.HOLD, label: "HOLD", aria: "홀드" },
];
const ROTATE_ROW: InstantButton[] = [
  { action: ACTION.ROTATE_CCW, label: "↺", aria: "반시계 방향 회전" },
  { action: ACTION.ROTATE_CW, label: "↻", aria: "시계 방향 회전" },
];

const buttonShape =
  "flex select-none items-center justify-center rounded-2xl border font-bold text-slate-100 shadow-[0_8px_20px_rgba(2,6,23,0.5)]";
const NEUTRAL_TONE = "border-white/15 bg-slate-800/80 active:border-sky-300/60 active:bg-sky-500/40";
/** 하드 드롭 — 되돌릴 수 없는 동작이라 색으로도 구분한다 */
const DANGER_TONE = "border-rose-300/30 bg-rose-950/60 active:border-rose-300/60 active:bg-rose-500/40";

/**
 * 크기는 화면 폭 비례 — 320px에서 두 묶음이 한 줄에 들어가고(좌 48·우 52px, 손가락 기준 44px 이상) 넓은 화면에서는 상한까지
 * 판 높이를 덜 먹게 위 줄(하드 드롭·홀드)은 낮게
 */
const MOVE_SIZE = "h-[clamp(48px,14.5vw,64px)] w-[clamp(48px,14.5vw,64px)]";
const ROTATE_SIZE = "h-[clamp(52px,16vw,68px)] w-[clamp(52px,16vw,72px)]";
const TOP_SIZE = "h-[clamp(44px,12vw,52px)] w-[clamp(52px,16vw,72px)]";

/**
 * 모바일 가상 버튼 — 멀티터치(좌 이동 누른 채 회전 등). 포인터를 캡처해 손가락이 벗어나도 뗌을 놓치지 않는다
 * 싱글·대전이 함께 쓴다
 */
export function TouchControls({ onHoldStart, onHoldEnd, onInstant }: TouchControlsProps) {
  const instantButton = (b: InstantButton, size: string, tone = NEUTRAL_TONE) => (
    <button
      key={b.action}
      type="button"
      aria-label={b.aria}
      className={`${buttonShape} ${size} ${tone} ${b.label.length > 2 ? "text-xs" : "text-2xl"}`}
      onPointerDown={(e) => {
        e.preventDefault();
        onInstant(b.action);
      }}
      // 키보드(Enter·Space)·보조기기의 누름은 포인터 이벤트 없이 click만 온다(detail 0) — 터치·마우스는 위에서 이미 처리 (FE-10)
      onClick={(e) => {
        if (e.detail === 0) onInstant(b.action);
      }}
    >
      {b.label}
    </button>
  );

  return (
    <div
      className="flex w-full items-end justify-between gap-3 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2"
      style={{ touchAction: "none" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="grid shrink-0 grid-cols-3 gap-2" role="group" aria-label="이동">
        {LEFT_CLUSTER.map((b) => (
          <button
            key={b.press}
            type="button"
            aria-label={b.aria}
            className={`${buttonShape} ${NEUTRAL_TONE} ${MOVE_SIZE} text-xl`}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              onHoldStart(b.press, b.release);
            }}
            onPointerUp={() => onHoldEnd(b.press)}
            onPointerCancel={() => onHoldEnd(b.press)}
            onLostPointerCapture={() => onHoldEnd(b.press)}
            // 키보드·스위치·스크린리더 누름은 포인터 없이 click만 온다(detail 0) — 누르고 바로 떼 한 칸만 (games-polish FE-29)
            onClick={(e) => {
              if (e.detail !== 0) return;
              onHoldStart(b.press, b.release);
              onHoldEnd(b.press);
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div className="flex shrink-0 flex-col gap-3">
        <div className="flex gap-2" role="group" aria-label="드롭·홀드">
          {TOP_ROW.map((b) =>
            instantButton(b, TOP_SIZE, b.action === ACTION.HARD_DROP ? DANGER_TONE : NEUTRAL_TONE),
          )}
        </div>
        <div className="flex gap-2" role="group" aria-label="회전">
          {ROTATE_ROW.map((b) => instantButton(b, ROTATE_SIZE))}
        </div>
      </div>
    </div>
  );
}
