"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ApiError } from "@/types/api";
import type { SkinCatalogItem } from "@/services/userService";
import { useMySkins } from "../hooks/useMySkins";
import { KNOWN_SKIN_IDS, SKIN_ITEM_LABELS, SKIN_SLOTS, SKIN_SLOT_LABELS, type SkinSlot, toSkinLevel } from "../lib/skins";
import { nextTabByKey } from "../lib/tabKeys";
import { SkinPreview } from "./SkinPreview";
import { SkinUpgradePanel } from "./SkinUpgradePanel";
import { ReloginButton } from "@/app/games/_shared/components/ReloginButton";

const SLOT_HINTS: Record<SkinSlot, string> = {
  block: "블록 7종·고스트·HOLD/NEXT",
  effect: "줄 삭제·콤보 연출 색",
  board: "판 배경·격자·테두리 네온",
  background: "게임 화면 바탕 — 나에게만 보여요",
};

/**
 * 테트리스 스킨 장착(D-003) — 설정 시트의 스킨 상세. 슬롯 탭(블록·연출·보드·배경) + 아이템 카드(미리보기·잠금 자리)
 * 로그인 사용자만 바꿀 수 있다(계정 저장). 게스트는 미리보기만 보고 "로그인하면 스킨 선택"
 * 카탈로그는 서버 것을 그대로 보인다(보유·잠금). 불러오기 전·실패면 이 프론트가 아는 아이템을 잠금 없이 보인다
 * 보드 슬롯은 상대·리플레이 화면에서도 내 장착으로 보인다(보드 주인 규칙), 배경은 나에게만
 * allowLeave=false: 판 도중(일시정지·대전) — 화면을 떠나는 도감 링크·로그인 버튼을 두지 않는다(확인 없이 판·경기를 떠나게 되므로)
 *   강화도 숨기고 레벨만 보인다(skin-levels — 판 시작 때 레벨로 고정되는 리플레이와 내 화면이 어긋나지 않게)
 * 카드마다 레벨, 아래에 지금 장착한 아이템의 레벨·강화(SkinUpgradePanel) — 다른 아이템을 강화하려면 먼저 장착한다(장착은 무료·즉시)
 */
export function SkinSettingsSection({ onNavigate, allowLeave = true }: { onNavigate?: () => void; allowLeave?: boolean }) {
  const tabsId = useId();
  const mine = useMySkins();
  const { status, equipped, catalog, loggedIn, equip } = mine;
  const [slot, setSlot] = useState<SkinSlot>("block");
  const tabRefs = useRef<Partial<Record<SkinSlot, HTMLButtonElement | null>>>({});

  const items: SkinCatalogItem[] =
    catalog && catalog[slot].length > 0 ? catalog[slot] : KNOWN_SKIN_IDS[slot].map((id) => ({ id, owned: true, unlock: "free" }));
  // 불러온 장착·카탈로그가 있을 때만 — 불러오기 전·실패·만료면 보유를 모르고 결과도 기본으로 그린다
  const canEquip = loggedIn && status === "ready";

  const choose = async (item: SkinCatalogItem) => {
    if (!canEquip || !item.owned || equipped[slot] === item.id) return;
    try {
      await equip(slot, item.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "스킨을 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  /** 탭 키보드 이동 — ←·→·Home·End, 포커스도 따라간다 */
  const onTabKey = (e: React.KeyboardEvent) => {
    const next = nextTabByKey(SKIN_SLOTS, slot, e.key);
    if (!next) return;
    e.preventDefault();
    setSlot(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <>

    {!loggedIn && (
      <div className="mb-3 rounded-xl border border-white/10 bg-slate-800/50 p-3 text-sm text-slate-300">
        <p>로그인하면 스킨을 고를 수 있어요. 지금은 기본 스킨으로 플레이해요.</p>
        {allowLeave ? <ReloginButton className="mt-2" label="카카오로 로그인" /> : <p className="mt-1 text-xs text-slate-400">판이 끝난 뒤 로그인할 수 있어요.</p>}
      </div>
    )}
    {loggedIn && status === "error" && <p className="mb-2 text-xs text-amber-300">스킨 정보를 불러오지 못해 기본 스킨으로 보여요.</p>}
    {loggedIn && status === "expired" && (
      <div className="mb-3 rounded-xl border border-white/10 bg-slate-800/50 p-3 text-sm text-slate-300">
        <p>로그인이 만료됐어요. 다시 로그인하면 내 스킨으로 바꿀 수 있어요.</p>
        {allowLeave ? <ReloginButton className="mt-2" /> : <p className="mt-1 text-xs text-slate-400">판이 끝난 뒤 다시 로그인할 수 있어요.</p>}
      </div>
    )}
    {allowLeave && (
      <Link href="/games/tetris/skins" onClick={onNavigate} className="mb-3 inline-flex min-h-11 items-center text-sm text-sky-300 hover:text-sky-200">
        전체 스킨 보기(얻는 방법) ›
      </Link>
    )}

    <div role="tablist" aria-label="스킨 슬롯" className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-slate-800/60 p-1" onKeyDown={onTabKey}>
      {SKIN_SLOTS.map((s) => (
        <button
          key={s}
          ref={(el) => {
            tabRefs.current[s] = el;
          }}
          type="button"
          role="tab"
          id={`${tabsId}-${s}`}
          aria-selected={slot === s}
          aria-controls={`${tabsId}-panel`}
          tabIndex={slot === s ? 0 : -1}
          onClick={() => setSlot(s)}
          className={`min-h-11 rounded-lg text-sm font-semibold ${slot === s ? "bg-sky-500/30 text-white" : "text-slate-400 hover:text-slate-200"}`}
        >
          {SKIN_SLOT_LABELS[s]}
        </button>
      ))}
    </div>

    <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${slot}`} className="min-h-0 overflow-y-auto">
      <p className="mb-2 text-xs text-slate-500">{SLOT_HINTS[slot]}</p>
      <div role="radiogroup" aria-label={`${SKIN_SLOT_LABELS[slot]} 스킨`} className="grid grid-cols-2 gap-3">
        {items.map((item) => {
          const selected = equipped[slot] === item.id;
          const locked = !item.owned;
          const label = SKIN_ITEM_LABELS[item.id] ?? item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={!canEquip || locked}
              data-testid={`skin-item-${slot}-${item.id}`}
              onClick={() => choose(item)}
              className={`flex flex-col items-center gap-2 rounded-xl border p-2 text-sm transition-colors ${
                selected ? "border-sky-400 bg-sky-500/10 text-white" : "border-slate-700/50 bg-slate-800/50 text-slate-300"
              } ${!canEquip || locked ? "cursor-not-allowed" : "hover:border-slate-500"}`}
            >
              <span className={`relative ${locked ? "opacity-40" : ""}`}>
                <SkinPreview slot={slot} id={item.id} level={toSkinLevel(item.level)} />
              </span>
              <span className="flex items-center gap-1">
                {locked && <span aria-hidden="true">🔒</span>}
                {label}
                {locked && <span className="sr-only">(잠김)</span>}
              </span>
              {/* 색(테두리)만으로 구분하지 않게 글자로도 */}
              {selected && <span className="text-[11px] text-sky-200">● 장착 중</span>}
              {loggedIn && item.owned && <span className="text-[11px] text-amber-200">Lv{toSkinLevel(item.level)}</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-3">
        <SkinUpgradePanel key={`${slot}:${equipped[slot]}`} mine={mine} slot={slot} id={equipped[slot]} allowUpgrade={allowLeave} onNavigate={onNavigate} />
      </div>
    </div>
    </>
  );
}
