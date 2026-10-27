"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ApiError } from "@/types/api";
import type { useMySkins } from "../hooks/useMySkins";
import { itemLevel } from "../lib/mySkins";
import { formatPoints } from "../lib/points";
import { MAX_SKIN_LEVEL, SKIN_ITEM_LABELS, SKIN_LEVEL_FEATURES, SKIN_SLOT_LABELS, type SkinSlot, toSkinLevel } from "../lib/skins";
import { SkinPreview } from "./SkinPreview";

type Props = {
  /** 부모의 useMySkins() — 여기서 따로 부르지 않는다(훅이 새로 붙을 때마다 불러오기 실패 뒤 다시 불러오기를 일으키지 않게) */
  mine: ReturnType<typeof useMySkins>;
  slot: SkinSlot;
  id: string;
  /** false = 판 도중(다음 판·대전) — 레벨·미리보기만, 강화 버튼은 숨긴다(판 시작 때 레벨로 고정되는 리플레이와 어긋나지 않게) */
  allowUpgrade?: boolean;
  /** 강화 비용 [Lv2로, …, Lv5로] — 내 카탈로그(nextCost)가 없을 때(게스트 도감) 비용 안내에 쓴다 */
  levelCosts?: readonly number[];
  /** 포인트 내역 링크로 화면을 떠날 때(설정 시트를 닫는다 — 시트의 도감 링크와 같게) */
  onNavigate?: () => void;
};

/**
 * 스킨 레벨·강화(skin-levels D-001) — 아이템 하나의 지금 레벨, Lv1~5 미리보기, 다음 비용·잔여 포인트, [강화] → 같은 자리 확인 단계
 * 레벨·비용·포인트는 내 스킨 저장소(useMySkins — GET me/skins의 catalog[level,nextCost]·points)가 기준이다
 * 확인은 모달을 겹치지 않고 같은 자리에서 — 설정 시트(대화상자) 안에서도 쓰기 때문(D-006과 같은 이유)
 * 강화는 계정 전체에서 한 번에 하나(upgrading) — 진행 중이면 모든 강화 버튼이 막힌다
 */
export function SkinUpgradePanel({ mine, slot, id, allowUpgrade = true, levelCosts, onNavigate }: Props) {
  const { status, loggedIn, catalog, points, upgrading, upgrade } = mine;
  const item = catalog?.[slot].find((x) => x.id === id) ?? null;
  const level = itemLevel(catalog, slot, id);
  const [previewLevel, setPreviewLevel] = useState(level);
  const [confirming, setConfirming] = useState(false);
  const upgradeRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  /** 확인 단계가 닫힌 뒤 포커스를 옮길지 — 아래 effect가 커밋 뒤에 옮긴다 */
  const refocusRef = useRef(false);

  // 레벨이 바뀌면(강화·다른 탭 강화를 다시 맞춤) 미리보기는 지금 레벨, 확인 단계는 닫는다 — 열려 있었으면 포커스도 [강화]·이 영역으로
  // (아이템이 바뀌면 부모가 key로 새로 마운트한다)
  useEffect(() => {
    setPreviewLevel(level);
    setConfirming((open) => {
      if (open) refocusRef.current = true;
      return false;
    });
  }, [level]);

  const maxed = level >= MAX_SKIN_LEVEL;
  // 내 카탈로그의 nextCost(만렙이면 null)가 기준 — 없으면(게스트·이 필드 배포 전) 도감의 levelCosts
  const nextCost = item && item.nextCost !== undefined ? item.nextCost : (levelCosts?.[level - 1] ?? null);
  const ready = loggedIn && status === "ready";
  const owned = Boolean(item?.owned);
  const balance = points?.balance ?? 0;
  const short = nextCost !== null && points ? Math.max(0, nextCost - balance) : 0;
  const canUpgrade = ready && allowUpgrade && owned && !maxed && nextCost !== null && points !== null && short === 0 && !upgrading;
  const name = SKIN_ITEM_LABELS[id] ?? id;

  const openConfirm = () => {
    setConfirming(true);
    requestAnimationFrame(() => confirmRef.current?.focus());
  };
  /**
   * 확인 단계가 닫히면 포커스를 [강화]로 — 만렙이 돼 버튼이 없으면 이 영역으로(대화상자 안에서 포커스가 body로 빠지지 않게)
   * 강화 응답 뒤에는 레벨·버튼이 다시 그려진 다음이어야 해서 커밋 뒤(effect)에 옮긴다
   */
  useEffect(() => {
    if (!refocusRef.current || confirming) return;
    refocusRef.current = false;
    // 잔액이 모자라 [강화]가 잠겼으면 버튼은 포커스를 받지 못한다 — 그때도 이 영역으로
    const button = upgradeRef.current;
    (button && !button.disabled ? button : sectionRef.current)?.focus();
  });
  // 열려 있을 때만 포커스를 옮긴다 — 이미 닫혔으면(레벨 변경이 먼저 닫음) 렌더가 없어 표시가 남아 다음 렌더에서 포커스를 빼앗는다
  const closeConfirm = () =>
    setConfirming((open) => {
      if (open) refocusRef.current = true;
      return false;
    });

  const run = async () => {
    if (upgrading) return;
    const target = level + 1;
    try {
      const result = await upgrade(slot, id);
      if (result === "upgraded") toast.success(`${SKIN_SLOT_LABELS[slot]} ${name} Lv${target} 강화 완료!`);
    } catch (err) {
      toast.error(upgradeErrorMessage(err));
    }
    closeConfirm();
  };

  /** 확인 단계의 Esc는 취소 — 설정 시트 전체를 닫지 않는다 */
  const onConfirmKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape") return;
    // 보내는 중에도 시트를 닫지 않는다(결과를 이 자리에서 알린다) — 취소는 보내기 전만
    e.stopPropagation();
    if (!upgrading) closeConfirm();
  };

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-label={`${name} 레벨`}
      data-testid={`skin-upgrade-${slot}-${id}`}
      className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-3 outline-none"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">
          {SKIN_SLOT_LABELS[slot]} {name} <span className="text-amber-200">Lv{level}</span>
        </h3>
        {ready &&
          points &&
          // 판 도중에는 화면을 떠나는 링크를 두지 않는다(설정 시트 allowLeave 규칙) — 글만
          (allowUpgrade ? (
            <Link href="/games/tetris/points" onClick={onNavigate} aria-label={`보유 ${formatPoints(balance)} · 포인트 내역`} className="inline-flex min-h-11 items-center text-xs text-slate-400 hover:text-slate-200">
              보유 {formatPoints(balance)}
              <span aria-hidden="true">&nbsp;›</span>
            </Link>
          ) : (
            <span className="text-xs text-slate-400">보유 {formatPoints(balance)}</span>
          ))}
      </div>

      <div className="mt-2 flex justify-center">
        <SkinPreview slot={slot} id={id} level={previewLevel} width={240} height={96} />
      </div>
      <div role="group" aria-label="레벨 미리보기" className="mt-2 grid grid-cols-5 gap-1">
        {Array.from({ length: MAX_SKIN_LEVEL }, (_, i) => i + 1).map((lv) => (
          <button
            key={lv}
            type="button"
            aria-pressed={previewLevel === lv}
            onClick={() => setPreviewLevel(lv)}
            className={`min-h-11 rounded-lg text-xs font-semibold ${
              previewLevel === lv ? "bg-amber-400/25 text-amber-100" : lv <= level ? "bg-slate-700/60 text-slate-200" : "bg-slate-900/60 text-slate-500"
            }`}
          >
            Lv{lv}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Lv{previewLevel}: {SKIN_LEVEL_FEATURES[slot][toSkinLevel(previewLevel) - 1]}
        {previewLevel > level && " (미리보기)"}
      </p>

      <div className="mt-3 border-t border-white/10 pt-3 text-sm" aria-live="polite">
        {maxed ? (
          <p className="text-amber-200">최고 레벨이에요.</p>
        ) : !loggedIn ? (
          <p className="text-slate-400">
            로그인하면 테트리스 점수로 강화할 수 있어요{nextCost !== null && ` (Lv${level + 1}까지 ${formatPoints(nextCost)})`}.
          </p>
        ) : status === "expired" ? (
          <p className="text-slate-400">다시 로그인한 뒤 강화할 수 있어요.</p>
        ) : !ready ? (
          <p className="text-slate-400">스킨 정보를 불러온 뒤 강화할 수 있어요.</p>
        ) : !owned ? (
          <p className="text-slate-400">보유한 스킨만 강화할 수 있어요.</p>
        ) : !allowUpgrade ? (
          <p className="text-slate-400">판이 끝난 뒤 강화할 수 있어요.</p>
        ) : confirming && nextCost !== null ? (
          <div onKeyDown={onConfirmKey}>
            <p className="text-slate-200">
              {formatPoints(nextCost)}를 써서 Lv{level + 1}로 강화할까요? 쓴 포인트는 돌아오지 않아요.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {/* 보내는 중에는 disabled 대신 aria-disabled — 포커스가 body로 빠지면 Esc가 시트를 닫는다 */}
              <button
                type="button"
                onClick={() => !upgrading && closeConfirm()}
                aria-disabled={upgrading}
                className="min-h-11 rounded-full border border-white/20 text-slate-200 aria-disabled:opacity-50"
              >
                취소
              </button>
              <button
                ref={confirmRef}
                type="button"
                onClick={run}
                aria-disabled={upgrading}
                data-testid="skin-upgrade-confirm"
                className="min-h-11 rounded-full bg-amber-400 font-semibold text-slate-950 aria-disabled:opacity-60"
              >
                {upgrading ? "강화 중…" : "강화하기"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-slate-200">
                Lv{level} → Lv{level + 1} · {nextCost !== null ? formatPoints(nextCost) : "—"}
              </p>
              {short > 0 && <p className="text-xs text-amber-300">{formatPoints(short)} 더 필요해요 — 테트리스 점수만큼 쌓여요</p>}
            </div>
            <button
              ref={upgradeRef}
              type="button"
              onClick={openConfirm}
              disabled={!canUpgrade}
              data-testid="skin-upgrade-button"
              className="min-h-11 shrink-0 rounded-full border border-amber-300/50 px-5 font-semibold text-amber-100 hover:bg-amber-400/10 disabled:opacity-40"
            >
              강화
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/** 강화 실패 안내 — 409는 상황에 맞는 문구, 그 밖은 서버 메시지(한국어) */
export function upgradeErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "USER_POINTS_INSUFFICIENT") return "포인트가 부족해요.";
    if (err.code === "USER_SKIN_LEVEL_MISMATCH") return "레벨이 다른 곳에서 바뀌었어요. 최신 상태로 다시 불러왔어요.";
    if (err.code === "USER_SKIN_NOT_OWNED") return "보유한 스킨만 강화할 수 있어요.";
    if (err.status === 401) return "로그인이 만료됐어요. 다시 로그인한 뒤 강화해 주세요.";
    return err.message;
  }
  return "강화하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}
