"use client";

import { useCallback, useRef } from "react";

/** 공격 궤적 비행 시간 */
const FLIGHT_MS = 450;

/** 꼬리 구슬 — 앞 구슬을 늦게 따라가며 작아진다 (네온 혜성, DESIGN §20) */
const TAIL_DELAYS_MS = [45, 90];

/**
 * 공격 궤적 — 보낸 사람 판에서 받는 사람 판으로 빛나는 혜성이 날아가고, 닿는 자리에서 충격 링이 퍼진다 (DESIGN §14·§20)
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
      const x0 = a.left + a.width / 2 - base.left - size / 2;
      const y0 = a.top + a.height / 2 - base.top - size / 2;
      const x1 = b.left + b.width / 2 - base.left - size / 2;
      const y1 = b.top + b.height / 2 - base.top - size / 2;
      // 키프레임 opacity가 inline 값을 덮으므로 꼬리의 옅기는 여기서 곱한다
      const path = (scale: number, alpha: number): Keyframe[] => [
        { transform: `translate(${x0}px, ${y0}px) scale(${0.6 * scale})`, opacity: 0.9 * alpha },
        { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 40}px) scale(${scale})`, opacity: alpha },
        { transform: `translate(${x1}px, ${y1}px) scale(${0.8 * scale})`, opacity: 0.2 * alpha },
      ];
      const spawn = (css: string) => {
        const el = document.createElement("span");
        el.setAttribute("aria-hidden", "true");
        el.style.cssText = `position:absolute;left:0;top:0;border-radius:9999px;pointer-events:none;z-index:20;${css}`;
        root.appendChild(el);
        return el;
      };
      const fly = (el: HTMLElement, scale: number, alpha: number, delay: number, onDone?: () => void) => {
        const animation = el.animate(path(scale, alpha), { duration: FLIGHT_MS, delay, easing: "cubic-bezier(0.3, 0, 0.2, 1)", fill: "backwards" });
        animation.onfinish = () => {
          el.remove();
          onDone?.();
        };
        animation.oncancel = () => el.remove();
      };
      // 꼬리 → 머리 순서로 붙여 머리가 위에 그려지게
      TAIL_DELAYS_MS.forEach((delay, i) => {
        const tail = spawn(`width:${size}px;height:${size}px;background:radial-gradient(circle,#fda4af 0%,rgba(251,113,133,0) 65%);`);
        fly(tail, 0.75 - i * 0.2, 0.5 - i * 0.15, delay);
      });
      const head = spawn(
        `width:${size}px;height:${size}px;background:radial-gradient(circle,#fff 0%,#fb7185 45%,rgba(251,113,133,0) 70%);box-shadow:0 0 ${size}px ${Math.round(size / 3)}px rgba(244,63,94,0.55);`,
      );
      // 닿는 자리 — 붉은 충격 링이 퍼진다
      fly(head, 1, 1, 0, () => {
        const ring = spawn(`width:${size}px;height:${size}px;border:2px solid #fb7185;box-shadow:0 0 12px #f43f5e;`);
        const impact = ring.animate(
          [
            { transform: `translate(${x1}px, ${y1}px) scale(0.6)`, opacity: 0.9 },
            { transform: `translate(${x1}px, ${y1}px) scale(2.6)`, opacity: 0 },
          ],
          { duration: 260, easing: "ease-out" },
        );
        impact.onfinish = () => ring.remove();
        impact.oncancel = () => ring.remove();
      });
    },
    [reduced],
  );

  return { rootRef, fire };
}
