"use client";

import { useEffect, useRef } from "react";
import type { RingOption } from "../lib/ringOptions";

/**
 * 링 메뉴 (defense DESIGN §F3) — 슬롯 둘레에 버튼, 2탭 확정(첫 탭 = 미리보기, 같은 버튼 다시 탭 = 명령)
 * 골드가 모자란 항목은 회색·비활성(엔진에 보내지 않는다, §F0-2). 버튼 44px 이상, 링이 화면 밖으로 나가지 않게 가운데를 민다
 * 미리보기 상태(armed)와 2탭 판정(lib/ringOptions tapRing)은 부모가 가진다 — 키보드 단축키도 같은 경로로 탭한다
 */

const RADIUS = 64;
const BUTTON = 52;
const EDGE = 6;

const HINT_TEXT = { good: "▲ 다음 웨이브에 유리", neutral: "■ 보통", bad: "▼ 다음 웨이브에 불리" } as const;

type Props = {
  options: readonly RingOption[];
  /** 슬롯 중심 (컨테이너 CSS px) */
  anchor: { x: number; y: number };
  bounds: { width: number; height: number };
  /** 미리보기 중인 항목 id */
  armed: string | null;
  /** 키보드로 열었으면 첫 활성 항목으로 포커스(마우스·터치는 포커스를 옮기지 않는다 — Space가 버튼을 누르지 않게) */
  focusOnOpen: boolean;
  onTap: (option: RingOption) => void;
};

export function TowerRing({ options, anchor, bounds, armed, focusOnOpen, onTap }: Props) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  // 키보드로 열었으면 첫 활성 항목으로 포커스 — 나머지 슬롯을 Tab으로 지나지 않게. 열릴 때 한 번(슬롯이 바뀌면 부모가 key로 새로 만든다)
  const focusOnOpenRef = useRef(focusOnOpen);
  useEffect(() => {
    if (focusOnOpenRef.current) buttons.current.find((b) => b && !b.disabled)?.focus({ preventScroll: true });
  }, []);
  const reach = RADIUS + BUTTON / 2 + EDGE;
  const cx = Math.min(Math.max(anchor.x, reach), Math.max(reach, bounds.width - reach));
  const cy = Math.min(Math.max(anchor.y, reach), Math.max(reach, bounds.height - reach));
  const armedOption = options.find((o) => o.id === armed) ?? null;
  // 설명 카드는 링 반대편(위쪽 절반이면 아래로)
  const cardBelow = cy < bounds.height / 2;

  return (
    <div className="pointer-events-none absolute inset-0" data-testid="defense-ring">
      {options.map((option, i) => {
        const angle = (Math.PI * 2 * i) / options.length - Math.PI / 2;
        const x = cx + Math.cos(angle) * RADIUS - BUTTON / 2;
        const y = cy + Math.sin(angle) * RADIUS - BUTTON / 2;
        const isArmed = armed === option.id;
        return (
          <button
            key={option.id}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            data-testid={`defense-ring-${option.id}`}
            data-armed={isArmed ? "true" : "false"}
            disabled={!option.enabled}
            aria-pressed={option.confirm ? isArmed : undefined}
            aria-label={`${option.label}${option.price ? ` ${option.price.kind === "cost" ? "" : "환급 "}${option.price.amount}골드` : ""}${isArmed ? " — 한 번 더 누르면 확정" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onTap(option);
            }}
            className={`pointer-events-auto absolute flex flex-col items-center justify-center rounded-full border text-[11px] font-semibold leading-tight shadow-lg shadow-black/40 ${
              isArmed
                ? "border-amber-300 bg-amber-500/90 text-slate-950"
                : option.enabled
                  ? "border-white/30 bg-slate-800/95 text-slate-100"
                  : "border-white/10 bg-slate-900/90 text-slate-500"
            }`}
            style={{ left: x, top: y, width: BUTTON, height: BUTTON }}
          >
            <span className="max-w-full truncate px-1">{option.label}</span>
            {option.price && (
              <span className="tabular-nums text-[10px] opacity-90">
                {option.price.kind === "refund" ? "+" : ""}
                {option.price.amount}
              </span>
            )}
          </button>
        );
      })}
      {armedOption && (
        <div
          role="status"
          data-testid="defense-ring-detail"
          className="absolute left-2 right-2 rounded-xl border border-white/15 bg-slate-900/95 px-3 py-2 text-xs text-slate-200 shadow-lg shadow-black/40"
          style={cardBelow ? { top: Math.min(bounds.height - 72, cy + reach) } : { top: Math.max(4, cy - reach - 68) }}
        >
          <p className="font-semibold text-white">
            {armedOption.label} — 한 번 더 누르면 확정
            <span className="ml-1 text-[10px] text-slate-400">({armedOption.shortcut})</span>
          </p>
          <p className="mt-0.5">{armedOption.detail}</p>
          {armedOption.hint && <p className="mt-0.5 text-slate-400">{HINT_TEXT[armedOption.hint]}</p>}
        </div>
      )}
    </div>
  );
}
