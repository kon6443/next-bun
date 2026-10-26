"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { GameSettingsButton } from "@/app/games/_shared/components/GameSettingsButton";
import { ReloginButton } from "@/app/games/_shared/components/ReloginButton";
import { useMySkins } from "../hooks/useMySkins";
import { SKIN_ITEM_LABELS, SKIN_SLOTS, SKIN_SLOT_LABELS } from "../lib/skins";
import { SkinPreview } from "./SkinPreview";
import { TetrisSettingsSheet } from "./TetrisSettingsSheet";

/**
 * 테트리스 홈 상단 "내 스킨" 카드(D-003) — 지금 장착 미리보기 + 바꾸기(설정 시트의 스킨 상세)·도감
 * 게스트는 같은 자리에 "로그인하고 스킨 꾸미기" — 기본 스킨 미리보기로 무엇을 꾸밀 수 있는지 보인다
 */
export function MySkinCard({ className = "" }: { className?: string }) {
  const { equipped, loggedIn, status } = useMySkins();
  const summary = SKIN_SLOTS.map((slot) => `${SKIN_SLOT_LABELS[slot]} ${SKIN_ITEM_LABELS[equipped[slot]] ?? equipped[slot]}`).join(" · ");

  return (
    <section className={className} aria-labelledby="my-skin-title" data-testid="my-skin-card">
      <div className="flex items-center gap-3">
        <span className="shrink-0 overflow-hidden rounded-xl border border-white/10">
          <SkinPreview slot="block" id={equipped.block} width={96} height={40} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="my-skin-title" className="text-base font-semibold text-white">
            {loggedIn ? "내 스킨" : "로그인하고 스킨 꾸미기"}
          </h2>
          <p className="truncate text-xs text-slate-400">
            {loggedIn ? (status === "expired" ? "로그인이 만료됐어요 — 다시 로그인하면 내 스킨으로" : summary) : "블록·연출·보드·배경을 내 취향으로"}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        {loggedIn && status !== "expired" ? (
          <SkinChangeButton className="flex min-h-11 flex-1 items-center justify-center rounded-full bg-sky-500/20 px-4 text-sm font-semibold text-sky-100 hover:bg-sky-500/30">
            바꾸기
          </SkinChangeButton>
        ) : (
          <ReloginButton className="flex-1" label={loggedIn ? undefined : "카카오로 로그인"} />
        )}
        <Link
          href="/games/tetris/skins"
          className="flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/20 px-4 text-sm font-semibold text-slate-200 hover:border-white/40"
        >
          도감
        </Link>
      </div>
    </section>
  );
}

/** 스킨 상세로 바로 여는 버튼 — 홈 카드·게임 오버·일시정지. 열린 시트의 ←는 설정 목록으로 */
export function SkinChangeButton({
  children,
  className,
  onOpenChange,
}: {
  children: ReactNode;
  className: string;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <GameSettingsButton
      testId="skin-change"
      className={className}
      onOpenChange={onOpenChange}
      renderSheet={(close) => <TetrisSettingsSheet onClose={close} initialGroup="skin" />}
    >
      {children}
    </GameSettingsButton>
  );
}
