"use client";

import type { ReactNode } from "react";
import { GameSettingsButton } from "@/app/games/_shared/components/GameSettingsButton";
import { ReloginButton } from "@/app/games/_shared/components/ReloginButton";
import { useMySkins } from "../hooks/useMySkins";
import { SKIN_ITEM_LABELS, SKIN_SLOTS, SKIN_SLOT_LABELS } from "../lib/skins";
import { SkinPreview } from "./SkinPreview";
import { formatPoints } from "../lib/points";
import { type ControlsMode, TetrisSettingsSheet } from "./TetrisSettingsSheet";

/**
 * 테트리스 홈 "내 스킨" 한 줄(D-003·tetris-home) — 지금 장착 미리보기·요약·보유 포인트, 누르면 설정 시트의 스킨 상세(레벨·강화)
 * 게스트·로그인 만료는 같은 자리에 로그인 버튼 — 기본 스킨 미리보기로 무엇을 꾸밀 수 있는지 보인다. 도감은 홈 아래 링크 줄
 */
export function MySkinCard({ className = "" }: { className?: string }) {
  const { equipped, levels, loggedIn, status, points } = useMySkins();
  // 레벨은 Lv2부터 붙인다 — 모두 Lv1이면 레벨 도입 전과 같은 요약
  const summary = SKIN_SLOTS.map(
    (slot) => `${SKIN_SLOT_LABELS[slot]} ${SKIN_ITEM_LABELS[equipped[slot]] ?? equipped[slot]}${levels[slot] >= 2 ? ` Lv${levels[slot]}` : ""}`,
  ).join(" · ");
  const preview = (
    <span className="shrink-0 overflow-hidden rounded-lg border border-white/10">
      <SkinPreview slot="block" id={equipped.block} level={levels.block} width={64} height={28} />
    </span>
  );
  const canChange = loggedIn && status !== "expired";

  return (
    <section className={className} aria-labelledby="my-skin-title" data-testid="my-skin-card">
      {canChange ? (
        <SkinChangeButton className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-white/5">
          {preview}
          <span className="min-w-0 flex-1">
            <span id="my-skin-title" className="block text-sm font-semibold text-white">
              내 스킨
            </span>
            <span className="block truncate text-xs text-slate-400">{summary}</span>
          </span>
          {points && <span className="shrink-0 text-sm font-semibold text-amber-200">{formatPoints(points.balance)}</span>}
          <span aria-hidden="true" className="text-slate-400">
            ›
          </span>
        </SkinChangeButton>
      ) : (
        <div className="flex min-h-14 items-center gap-3 px-3 py-2">
          {preview}
          <span className="min-w-0 flex-1">
            <span id="my-skin-title" className="block text-sm font-semibold text-white">
              {loggedIn ? "내 스킨" : "로그인하고 스킨 꾸미기"}
            </span>
            <span className="block truncate text-xs text-slate-400">
              {loggedIn ? "로그인이 만료됐어요" : "점수로 포인트를 모아 스킨 강화"}
            </span>
          </span>
          <ReloginButton className="shrink-0" label={loggedIn ? "다시 로그인" : "로그인"} />
        </div>
      )}
    </section>
  );
}

/** 스킨 상세로 바로 여는 버튼 — 홈 카드·게임 오버·일시정지. 열린 시트의 ←는 설정 목록으로 */
export function SkinChangeButton({
  children,
  className,
  onOpenChange,
  controls = "edit",
}: {
  children: ReactNode;
  className: string;
  onOpenChange?: (open: boolean) => void;
  /** 판 도중이면 next-game — 조작 안내·이탈 링크 규칙이 같은 화면의 "설정"과 같게 */
  controls?: ControlsMode;
}) {
  return (
    <GameSettingsButton
      testId="skin-change"
      className={className}
      onOpenChange={onOpenChange}
      renderSheet={(close) => <TetrisSettingsSheet onClose={close} initialGroup="skin" controls={controls} />}
    >
      {children}
    </GameSettingsButton>
  );
}
