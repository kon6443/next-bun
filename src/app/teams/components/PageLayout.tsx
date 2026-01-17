import { teamsPageBackground, layoutStyles } from "@/styles/teams";

type MaxWidth = "4xl" | "5xl" | "6xl";

type TeamsPageLayoutProps = {
  children: React.ReactNode;
  /** 최대 너비 (기본값: 5xl) */
  maxWidth?: MaxWidth;
};

const maxWidthClasses: Record<MaxWidth, string> = {
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
};

/**
 * Teams 페이지 공통 레이아웃 컴포넌트
 * - 배경 그라데이션 적용
 * - 반응형 패딩 및 간격 설정
 */
export function TeamsPageLayout({
  children,
  maxWidth = "5xl",
}: TeamsPageLayoutProps) {
  return (
    <div className={layoutStyles.pageContainer} style={teamsPageBackground}>
      <main
        className={`${layoutStyles.mainContent} ${maxWidthClasses[maxWidth]}`}
      >
        {children}
      </main>
    </div>
  );
}

type CenteredLayoutProps = {
  children: React.ReactNode;
};

/**
 * 중앙 정렬 레이아웃 (모달, 알림 페이지용)
 */
export function TeamsCenteredLayout({ children }: CenteredLayoutProps) {
  return (
    <div className={layoutStyles.pageContainer} style={teamsPageBackground}>
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
        {children}
      </div>
    </div>
  );
}
