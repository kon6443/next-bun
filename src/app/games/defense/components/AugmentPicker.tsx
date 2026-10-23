"use client";

import { useCallback, useEffect, useState } from "react";
import { useDialog } from "@/app/hooks/useDialog";
import { AUGMENT_TEXT, RARITY_NAMES } from "../lib/labels";

/**
 * 증강 선택 (defense DESIGN §F6·§L10) — 5웨이브 클리어마다 판이 멈추고 카드 3장 중 하나를 고른다
 * 2탭 확정(§F0-2): 카드 탭 = 크게 보기(선택 표시), 같은 카드 다시 탭 = 고르기. 키보드 1~3도 같은 2단계
 * 희귀도는 테두리 색 + 글자(색만으로 구분하지 않는다, §F0-4)
 */
type Props = {
  /** 카드 id 3장 (엔진 state.augmentChoices) */
  choices: readonly number[];
  /** 고른 카드의 순번(0~2) — PICK_AUGMENT 인자 */
  onPick: (index: number) => void;
  /** 카드의 희귀도 (엔진 AUGMENTS[id].rarity) */
  rarityOf: (id: number) => number;
};

const RARITY_STYLE: readonly string[] = ["border-slate-400/70", "border-sky-400", "border-amber-300 shadow-amber-400/30"];

export function AugmentPicker({ choices, onPick, rarityOf }: Props) {
  const [armed, setArmed] = useState<number | null>(null);
  // 카드를 고르기 전에는 닫히지 않는다(Esc 없음) — 판이 멈춘 상태
  const dialogRef = useDialog<HTMLElement>(true, noop, { closeOnEscape: false });
  const tap = useCallback(
    (index: number) => {
      if (armed === index) onPick(index);
      else setArmed(index);
    },
    [armed, onPick],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.isComposing) return;
      const index = /^(Digit|Numpad)[1-3]$/.test(e.code) ? Number(e.code.slice(-1)) - 1 : -1;
      if (index < 0 || index >= choices.length) return;
      e.preventDefault();
      tap(index);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tap, choices.length]);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/80 p-3">
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="defense-augment-title"
        data-testid="defense-augment"
        className="w-full max-w-md focus:outline-none"
      >
        <h2 id="defense-augment-title" className="text-center text-lg font-bold text-white">
          증강을 하나 고르세요
        </h2>
        <p className="mt-1 text-center text-xs text-slate-300">카드를 눌러 보고, 한 번 더 누르면 골라요 (1~3)</p>
        <ul className="mt-3 grid gap-2">
          {choices.map((id, index) => {
            const text = AUGMENT_TEXT[id];
            const rarity = rarityOf(id);
            const isArmed = armed === index;
            return (
              <li key={`${id}-${index}`}>
                <button
                  type="button"
                  data-testid={`defense-augment-card-${index}`}
                  data-card={id}
                  data-armed={isArmed}
                  aria-pressed={isArmed}
                  onClick={() => tap(index)}
                  className={`flex min-h-16 w-full flex-col items-start gap-0.5 rounded-2xl border-2 bg-slate-900 px-4 py-3 text-left shadow-lg transition-transform motion-reduce:transition-none ${RARITY_STYLE[rarity] ?? RARITY_STYLE[0]} ${isArmed ? "scale-[1.02] bg-slate-800" : ""}`}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="font-bold text-white">{text?.name ?? `카드 ${id + 1}`}</span>
                    <span className="shrink-0 rounded-full bg-white/10 px-2 text-[11px] text-slate-200">{RARITY_NAMES[rarity] ?? ""}</span>
                  </span>
                  <span className="text-sm text-slate-300">{text?.desc ?? ""}</span>
                  {isArmed && <span className="text-xs font-semibold text-amber-200">한 번 더 누르면 골라요</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function noop() {}
