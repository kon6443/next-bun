"use client";

/**
 * 포트리스 화면 공통 모양 — 테트리스 화면과 같은 토큰(칩 버튼·카드·선택 칸·키 표시)을 한곳에 둔다
 * 근거: 칩 버튼 TetrisPlay header, 카드 cardStyles.section·BattleLobbyView, 선택 칸 BattleLobbyView 인원 pill
 */

/** 화면 위 작은 버튼(나가기·도움말) */
export const CHIP_BUTTON = "flex min-h-11 min-w-11 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-xs text-slate-400 hover:text-slate-200";

/** 페이지 카드 */
export const CARD = "rounded-3xl border border-white/10 bg-slate-900/80 p-5";

/** 선택 칸(aria-pressed) */
export function choiceClass(active: boolean): string {
  return `min-h-11 flex-1 rounded-xl border px-2 text-sm transition disabled:opacity-40 ${active ? "border-sky-400/70 bg-sky-500/20 text-sky-100" : "border-slate-700/60 bg-slate-900/60 text-slate-300 hover:text-slate-100"}`;
}

/** 섹션 라벨 — 오버레이·카드 머리 */
export const EYEBROW = "text-xs font-semibold tracking-[0.4em] text-slate-400";

/** 키보드 키 표시 — 터치 기기(굵은 포인터)에서는 숨긴다(WaitingRoom 키보드 안내와 같은 질의) */
export function Keycap({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex min-w-5 items-center justify-center rounded border border-slate-600 bg-slate-800 px-1 font-mono text-[11px] leading-4 text-sky-300 [@media(pointer:coarse)]:hidden">{children}</kbd>;
}

/**
 * 마우스·터치로 누른 버튼에 포커스를 남기지 않는다 — 남은 포커스가 다음 스페이스(충전 발사)를 가로채지 않게
 * 키보드(Tab)로 들어간 포커스는 그대로다
 */
export function noMouseFocus(e: React.MouseEvent) {
  e.preventDefault();
}
