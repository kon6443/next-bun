import type { CSSProperties } from "react";

/**
 * Teams 페이지 공통 배경 스타일
 * Safari 성능 이슈로 blur 대신 radial-gradient 사용
 */
export const teamsPageBackground: CSSProperties = {
  background:
    "radial-gradient(circle at 20% 20%, rgba(79,70,229,0.15), transparent 50%), radial-gradient(circle at 80% 80%, rgba(14,165,233,0.1), transparent 50%), rgb(2,6,23)",
};

/**
 * 공통 CSS 클래스명 상수
 */
export const cardStyles = {
  /** 기본 섹션 카드 */
  section: "rounded-3xl border border-white/10 bg-slate-900/80",
  /** 에러 상태 섹션 카드 */
  errorSection: "rounded-3xl border border-red-500/20 bg-red-900/50",
  /** 대시 보더 내부 컨테이너 */
  dashedContainer: "rounded-2xl border border-dashed border-white/20",
  /** 에러 대시 보더 내부 컨테이너 */
  errorDashedContainer: "rounded-2xl border border-dashed border-red-500/20",
} as const;

/**
 * 모바일 최적화 최대 너비 (TeamBoard 기준)
 * 모든 Teams 관련 페이지에서 공통으로 사용
 */
export const MOBILE_MAX_WIDTH = "max-w-lg";

/**
 * 페이지 레이아웃 기본 클래스
 *
 * mainContent 의 pb-* 는 TeamsPageLayout 의 hasFab prop 에서 결정한다.
 * - hasFab=false: pb-24 (BottomNavBar 만 회피)
 * - hasFab=true : pb-52 (FAB 영역까지 회피)
 */
export const layoutStyles = {
  /** 페이지 루트 컨테이너 */
  pageContainer: "relative min-h-screen overflow-hidden text-slate-100",
  /** 메인 컨텐츠 영역 (모바일 최적화) — pb 는 TeamsPageLayout 에서 적용 */
  mainContent: "relative z-10 mx-auto flex flex-col gap-3 sm:gap-6 px-4 pt-6 sm:pt-12",
  /** FAB 미사용 페이지 하단 패딩 (BottomNavBar 회피) */
  bottomPaddingDefault: "pb-24",
  /** FAB 사용 페이지 하단 패딩 (FAB 영역 + BottomNavBar 회피) */
  bottomPaddingWithFab: "pb-52",
} as const;

/**
 * 뷰 컨테이너 공통 스타일
 * GanttChart, ListView, CalendarView 등에서 사용
 */
export const viewContainerStyles = 
  "rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_25px_60px_rgba(15,23,42,0.55)] backdrop-blur-xl";
