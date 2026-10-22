"use client";

import { useCallback, useRef } from "react";

/** 공격 궤적 비행 시간 */
const FLIGHT_MS = 450;

/**
 * 공격 궤적 — 보낸 사람 판에서 받는 사람 판으로 빛 구슬이 날아간다 (DESIGN §14 대전 연출)
 * 기준점은 루트 안의 `data-attack-anchor="{playerId}"` 요소. 연출 줄이기면 그리지 않는다
 * Web Animations API만 쓴다(새 의존성 없음). 구슬 크기는 줄 수에 비례
 */
export function useAttackTrails(reduced: boolean) {
  const rootRef = useRef<HTMLDivElement>(null);

  const fire = useCallback(
    (from: string, to: string, lines: number) => {
      const root = rootRef.current;
      if (!root || reduced || lines <= 0) return;
      const source = root.querySelector<HTMLElement>(`[data-attack-anchor="${CSS.escape(from)}"]`);
      const target = root.querySelector<HTMLElement>(`[data-attack-anchor="${CSS.escape(to)}"]`);
      if (!source || !target) return;
      const base = root.getBoundingClientRect();
      const a = source.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      const size = Math.min(28, 10 + lines * 3);
      const dot = document.createElement("span");
      dot.setAttribute("aria-hidden", "true");
      dot.style.cssText = `position:absolute;left:0;top:0;width:${size}px;height:${size}px;border-radius:9999px;pointer-events:none;z-index:20;background:radial-gradient(circle,#fff 0%,#fb7185 45%,rgba(251,113,133,0) 70%);`;
      root.appendChild(dot);
      const x0 = a.left + a.width / 2 - base.left - size / 2;
      const y0 = a.top + a.height / 2 - base.top - size / 2;
      const x1 = b.left + b.width / 2 - base.left - size / 2;
      const y1 = b.top + b.height / 2 - base.top - size / 2;
      const animation = dot.animate(
        [
          { transform: `translate(${x0}px, ${y0}px) scale(0.6)`, opacity: 0.9 },
          { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 40}px) scale(1)`, opacity: 1 },
          { transform: `translate(${x1}px, ${y1}px) scale(0.8)`, opacity: 0.2 },
        ],
        { duration: FLIGHT_MS, easing: "cubic-bezier(0.3, 0, 0.2, 1)" },
      );
      animation.onfinish = () => dot.remove();
      animation.oncancel = () => dot.remove();
    },
    [reduced],
  );

  return { rootRef, fire };
}
