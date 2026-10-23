"use client";

import { useState } from "react";
import { AUGMENT_TEXT, RULE_TEXT, bannedRuleText } from "../lib/labels";

/**
 * 플레이 화면 보조 줄 (defense DESIGN §F2 하단 보조) — 주간 규칙 아이콘 · 보유 증강 카드. 탭하면 설명 한 줄
 * 아이콘 1개 = 규칙 1개(§F0-4) — 아이콘은 보조기술에서 숨기고 이름을 읽는다
 */
type Props = {
  /** 주간 규칙 id (엔진 state.rules) — 무한은 빈 배열 */
  rules: readonly number[];
  bannedTower: number;
  /** 고른 증강 카드 id (엔진 state.augments, 고른 순) */
  augments: readonly number[];
};

const BAN_RULE = 6;

export function RankedStrip({ rules, bannedTower, augments }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  if (rules.length === 0 && augments.length === 0) return null;
  const items = [
    ...rules.map((id) => {
      const text = RULE_TEXT[id];
      return { key: `r${id}`, icon: text?.icon ?? "?", name: text?.name ?? `규칙 ${id}`, desc: id === BAN_RULE ? bannedRuleText(bannedTower) : (text?.desc ?? ""), kind: "rule" as const };
    }),
    ...augments.map((id, i) => ({ key: `a${i}`, icon: "🃏", name: AUGMENT_TEXT[id]?.name ?? `카드 ${id + 1}`, desc: AUGMENT_TEXT[id]?.desc ?? "", kind: "augment" as const })),
  ];
  const opened = items.find((item) => item.key === open) ?? null;
  return (
    <div className="px-3 pb-1" data-testid="defense-ranked-strip">
      <ul className="flex flex-wrap items-center gap-1.5">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              data-testid={item.kind === "rule" ? "defense-rule" : "defense-owned-augment"}
              aria-expanded={open === item.key}
              onClick={() => setOpen((current) => (current === item.key ? null : item.key))}
              className={`flex min-h-11 items-center gap-1 rounded-full border px-2.5 text-xs ${item.kind === "rule" ? "border-rose-300/40 text-rose-100" : "border-sky-300/40 text-sky-100"} ${open === item.key ? "bg-white/10" : ""}`}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {opened && (
        <p role="status" className="mt-1 text-xs text-slate-300">
          <span className="font-semibold text-white">{opened.name}</span> — {opened.desc}
        </p>
      )}
    </div>
  );
}
