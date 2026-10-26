"use client";

/** 길게 눌러도 선택·복사 메뉴를 막지 않을 곳 — 입력칸과, 직접 골라 복사하게 둔 글(공유 링크 등 `select-all`·`select-text`) */
export const SELECTABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"], .select-all, .select-text';

/**
 * 전체화면 게임 표면 (games-polish P9) — 꾹 누르면 글이 선택되거나 복사·공유 메뉴(콜아웃)·확대경이 뜨지 않게
 * 스타일은 globals.css의 [data-game-surface] 규칙(선택 끔·콜아웃 끔·탭 하이라이트 끔·이미지 끌기 끔, 입력칸·선택 허용 글은 되돌림)
 * 여기서는 길게 누르기·오른쪽 클릭의 contextmenu를 막는다 — 입력칸 안에서는 붙여넣기 메뉴가 떠야 하니 그대로 둔다
 */
export function GameSurface({ children, background }: { children: React.ReactNode; /** 화면 바탕(CSS background) — 없으면 기본(bg-slate-950). 테트리스 배경 스킨 */ background?: string }) {
  return (
    <div
      data-game-surface=""
      className="fixed inset-0 overflow-hidden overscroll-none bg-slate-950 text-slate-100"
      style={background ? { touchAction: "none", background } : { touchAction: "none" }}
      onContextMenu={(e) => {
        if (e.target instanceof Element && e.target.closest(SELECTABLE_SELECTOR)) return;
        e.preventDefault();
      }}
    >
      {children}
    </div>
  );
}
