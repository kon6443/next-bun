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
 * 페이지 레이아웃 기본 클래스
 */
export const layoutStyles = {
  /** 페이지 루트 컨테이너 */
  pageContainer: "relative min-h-screen overflow-hidden text-slate-100",
  /** 메인 컨텐츠 영역 (max-w-5xl) */
  mainContent: "relative z-10 mx-auto flex flex-col gap-6 sm:gap-10 px-4 pb-24 pt-12 sm:pt-16 sm:px-8",
} as const;
