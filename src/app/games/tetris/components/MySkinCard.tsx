"use client";

import type { ReactNode } from "react";
import { GameSettingsButton } from "@/app/games/_shared/components/GameSettingsButton";
import { useMySkins } from "../hooks/useMySkins";
import { SKIN_ITEM_LABELS, SKIN_SLOT_LABELS } from "../lib/skins";
import { formatPoints } from "../lib/points";
import { type ControlsMode, TetrisSettingsSheet } from "./TetrisSettingsSheet";

/**
 * 테트리스 홈 상단 바의 "내 스킨" 아이콘 버튼(tetris-home-chat) — 설정 톱니 옆. 누르면 설정 시트의 스킨 상세(레벨·강화)
 * 요약(블록 스킨·레벨·포인트)은 접근 이름에 — 포인트는 시트 안 강화 칸과 홈 링크 줄의 "포인트 내역"으로 본다
 * 게스트·로그인 만료도 같은 시트를 연다 — 시트가 "로그인하면 스킨을 고를 수 있어요"와 로그인 버튼을 보인다
 */
export function MySkinButton() {
  const { equipped, levels, loggedIn, status, points } = useMySkins();
  const level = levels.block;
  const canChange = loggedIn && status !== "expired";
  const label = !loggedIn
    ? "내 스킨 · 로그인하고 스킨 꾸미기"
    : status === "expired"
      ? "내 스킨 · 로그인이 만료됐어요"
      : [`내 스킨`, `${SKIN_SLOT_LABELS.block} ${SKIN_ITEM_LABELS[equipped.block] ?? equipped.block} Lv${level}`, points && `포인트 ${formatPoints(points.balance)}`]
          .filter(Boolean)
          .join(" · ");

  return (
    <SkinChangeButton
      ariaLabel={label}
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-900/70 text-xl hover:border-slate-500"
    >
      <span aria-hidden="true">🎨</span>
      {canChange && level > 1 && (
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 rounded-full border border-slate-900 bg-amber-400 px-1 text-[9px] font-bold leading-[14px] text-slate-900"
        >
          Lv{level}
        </span>
      )}
    </SkinChangeButton>
  );
}

/** 스킨 상세로 바로 여는 버튼 — 홈 상단 바·게임 오버·일시정지. 열린 시트의 ←는 설정 목록으로 */
export function SkinChangeButton({
  children,
  className,
  ariaLabel,
  onOpenChange,
  controls = "edit",
}: {
  children: ReactNode;
  className: string;
  /** 아이콘뿐인 버튼의 접근 이름 */
  ariaLabel?: string;
  onOpenChange?: (open: boolean) => void;
  /** 판 도중이면 next-game — 조작 안내·이탈 링크 규칙이 같은 화면의 "설정"과 같게 */
  controls?: ControlsMode;
}) {
  return (
    <GameSettingsButton
      testId="skin-change"
      className={className}
      ariaLabel={ariaLabel}
      onOpenChange={onOpenChange}
      renderSheet={(close) => <TetrisSettingsSheet onClose={close} initialGroup="skin" controls={controls} />}
    >
      {children}
    </GameSettingsButton>
  );
}
