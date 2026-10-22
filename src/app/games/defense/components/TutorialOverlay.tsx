"use client";

import type { TutorialStep } from "../lib/tutorial";

/**
 * S1 손가락 가이드 (defense DESIGN §F5) — 3단계: 돌 받침 누르기 → 궁수탑 두 번 눌러 짓기 → 웨이브 시작. 건너뛸 수 있다
 * 단계는 판 상태로 정해진다(lib/tutorial tutorialStep) — 이 컴포넌트는 안내 말풍선과 가리킴 표시만
 * 가리킴(target)은 화면 좌표(보드 컨테이너 기준). 판 조작을 막지 않는다(pointer-events 없음, 건너뛰기 버튼만)
 */

/** 가리킴 고리 지름(CSS px) — h-14 */
export const TUTORIAL_TARGET_SIZE = 56;

const TEXT: readonly string[] = ["빛나는 돌 받침을 눌러 보세요", "궁수탑을 한 번 눌러 미리 보고, 한 번 더 눌러 지어요", "아래 「웨이브 시작」을 눌러요"];

type Props = {
  step: TutorialStep;
  /** 가리킬 곳 (보드 기준 CSS px) — 없으면 말풍선만 */
  target: { x: number; y: number } | null;
  /** 말풍선을 위쪽에 둘지 — DefensePlay가 가리킬 곳·슬롯을 덜 덮는 쪽으로 고른다(lib/tutorial tutorialBubbleAbove) */
  above: boolean;
  onSkip: () => void;
};

export function TutorialOverlay({ step, target, above, onSkip }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-testid="defense-tutorial" data-step={step}>
      {target && (
        <span
          aria-hidden="true"
          className="absolute -translate-x-1/2 -translate-y-1/2 motion-safe:animate-ping rounded-full border-4 border-amber-300/90"
          style={{ left: target.x, top: target.y, width: TUTORIAL_TARGET_SIZE, height: TUTORIAL_TARGET_SIZE }}
        />
      )}
      <div
        role="status"
        data-place={above ? "top" : "bottom"}
        className={`absolute left-3 right-3 flex items-center gap-2 rounded-2xl border border-amber-300/50 bg-slate-900/95 px-3 py-2 text-sm text-amber-50 shadow-lg shadow-black/50 ${above ? "top-3" : "bottom-3"}`}
      >
        <span className="shrink-0 rounded-full bg-amber-400 px-2 text-xs font-bold text-slate-950">{step + 1}/3</span>
        <span className="flex-1">{TEXT[step]}</span>
        <button
          type="button"
          data-testid="defense-tutorial-skip"
          onClick={onSkip}
          className="pointer-events-auto min-h-11 shrink-0 rounded-full border border-white/20 px-3 text-xs text-slate-200"
        >
          건너뛰기
        </button>
      </div>
    </div>
  );
}
