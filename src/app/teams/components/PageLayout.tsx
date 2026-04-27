import { teamsPageBackground, layoutStyles, MOBILE_MAX_WIDTH } from "@/styles/teams";

type MaxWidth = "lg" | "4xl" | "5xl" | "6xl";

type TeamsPageLayoutProps = {
  children: React.ReactNode;
  /** 최대 너비 (기본값: lg - 모바일 최적화) */
  maxWidth?: MaxWidth;
  /** FAB(Floating Action Button) 사용 여부. true 면 하단 패딩이 FAB 영역까지 확장된다. */
  hasFab?: boolean;
};

const maxWidthClasses: Record<MaxWidth, string> = {
  "lg": MOBILE_MAX_WIDTH,
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
};

/**
 * Teams 페이지 공통 레이아웃 컴포넌트
 * - 배경 그라데이션 적용
 * - 모바일 최적화 레이아웃 (기본값: max-w-lg)
 * - hasFab=true 시 FAB 영역만큼 하단 패딩을 확장하여 콘텐츠 가림을 방지
 */
export function TeamsPageLayout({
  children,
  maxWidth = "lg",
  hasFab = false,
}: TeamsPageLayoutProps) {
  const bottomPadding = hasFab
    ? layoutStyles.bottomPaddingWithFab
    : layoutStyles.bottomPaddingDefault;

  return (
    <div className={layoutStyles.pageContainer} style={teamsPageBackground}>
      <main
        className={`${layoutStyles.mainContent} ${bottomPadding} ${maxWidthClasses[maxWidth]}`}
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
