"use client";

import { type ReactNode, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useDialog } from "@/app/hooks";

type SettingsSheetProps = {
  /** 제목(대화상자 이름) */
  title: string;
  onClose: () => void;
  /** 대화상자 data-testid */
  testId?: string;
  /** 폭 — sm: 짧은 설정(소리) · md: 탭·카드가 있는 설정(스킨, 높이도 화면의 85%까지) */
  size?: "sm" | "md";
  /** 제목 줄 왼쪽(목록으로 돌아가기 등) */
  headerStart?: ReactNode;
  children: ReactNode;
};

const PANEL_SIZE: Record<NonNullable<SettingsSheetProps["size"]>, string> = {
  sm: "w-full max-w-sm",
  md: "flex max-h-[85dvh] w-full max-w-md flex-col",
};

/**
 * 공통 설정 시트(D-001) — 모바일은 아래에서 올라오는 시트, sm 이상은 가운데 패널. 게임·화면이 내용(섹션)만 채운다
 * - body로 포털: 버튼이 놓인 자리(HUD의 nowrap·transform 조상 등)의 스타일을 물려받지 않게
 * - 키보드: 열리면 첫 컨트롤로 포커스, Tab은 안에서 돌고, Esc로 닫히며 포커스가 연 버튼으로 돌아간다(useDialog)
 * - 배경을 눌러 닫는다 — 배경에서 누르기 시작한 경우만(음량 막대를 끌다 배경에서 놓아도 닫히지 않게)
 * - 게임 표면(GameSurface)의 touch-action: none을 풀어 안의 스크롤·슬라이더가 동작하게
 */
export function SettingsSheet({ title, onClose, testId, size = "sm", headerStart, children }: SettingsSheetProps) {
  const dialogRef = useDialog<HTMLDivElement>(true, onClose);
  const titleId = useId();
  const pressedBackdropRef = useRef(false);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      style={{ touchAction: "auto" }}
      onPointerDown={(e) => {
        pressedBackdropRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdropRef.current) onClose();
        pressedBackdropRef.current = false;
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        className={`${PANEL_SIZE[size]} rounded-t-3xl border border-white/10 bg-slate-900 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] focus:outline-none sm:rounded-3xl sm:pb-4`}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            {headerStart}
            <h2 id={titleId} className="truncate text-base font-semibold text-white">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-slate-400 hover:text-slate-200"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
