/**
 * 로딩 스켈레톤 컴포넌트
 * 콘텐츠 로딩 중 실제 레이아웃의 윤곽을 보여줌
 * - 체감 로딩 속도 향상 (심리적 효과)
 * - Layout Shift 방지
 */

type SkeletonProps = {
  /** 스켈레톤 너비 (기본값: "100%") */
  width?: string;
  /** 스켈레톤 높이 (기본값: "1rem") */
  height?: string;
  /** 둥근 모서리 (기본값: "rounded") */
  rounded?: "none" | "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  /** 추가 CSS 클래스 */
  className?: string;
};

const roundedStyles = {
  none: "",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  full: "rounded-full",
};

/**
 * 기본 스켈레톤 블록
 */
export function Skeleton({
  width = "100%",
  height = "1rem",
  rounded = "md",
  className = "",
}: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-slate-700/50 ${roundedStyles[rounded]} ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

/**
 * 텍스트 라인 스켈레톤
 */
export function SkeletonText({
  lines = 1,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 && lines > 1 ? "75%" : "100%"}
          height="0.875rem"
        />
      ))}
    </div>
  );
}

/**
 * 태스크 카드 스켈레톤
 */
export function TaskCardSkeleton() {
  return (
    <div
      className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 space-y-3"
      aria-hidden="true"
    >
      {/* 마감일 영역 */}
      <div className="flex justify-end">
        <Skeleton width="60px" height="1rem" rounded="md" />
      </div>

      {/* 제목 */}
      <Skeleton width="80%" height="1.25rem" rounded="md" />

      {/* 설명 */}
      <SkeletonText lines={2} />

      {/* 담당자 */}
      <div className="flex items-center justify-between pt-2">
        <Skeleton width="100px" height="0.75rem" rounded="md" />
      </div>

      {/* 날짜 정보 */}
      <div className="flex gap-3 pt-1">
        <Skeleton width="70px" height="0.625rem" rounded="md" />
        <Skeleton width="90px" height="0.625rem" rounded="md" />
      </div>

      {/* 상태 드롭다운 */}
      <div className="pt-3 border-t border-white/5">
        <Skeleton width="100%" height="2.5rem" rounded="lg" />
      </div>
    </div>
  );
}

/**
 * 칸반 컬럼 스켈레톤
 */
export function KanbanColumnSkeleton({ cardCount = 3 }: { cardCount?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {/* 컬럼 헤더 */}
      <div className="flex items-center justify-between mb-4 px-2">
        <div className="flex items-center gap-3">
          <Skeleton width="2rem" height="2rem" rounded="xl" />
          <div className="space-y-1">
            <Skeleton width="80px" height="0.875rem" />
            <Skeleton width="60px" height="0.625rem" />
          </div>
        </div>
        <Skeleton width="50px" height="0.75rem" />
      </div>

      {/* 태스크 카드들 */}
      <div className="space-y-3">
        {Array.from({ length: cardCount }, (_, i) => (
          <TaskCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * 팀 보드 전체 스켈레톤
 */
export function TeamBoardSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true" role="status" aria-label="로딩 중">
      {/* 팀 헤더 */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-4 space-y-4">
        <Skeleton width="120px" height="0.75rem" />
        <Skeleton width="200px" height="2rem" />
        <Skeleton width="100%" height="0.875rem" />
        <div className="flex flex-col gap-2 pt-2">
          <Skeleton width="100%" height="2.5rem" rounded="full" />
          <Skeleton width="100%" height="2.5rem" rounded="full" />
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-white/10 bg-slate-900/30 p-4 space-y-2"
          >
            <Skeleton width="60px" height="0.625rem" />
            <Skeleton width="40px" height="1.5rem" />
            <Skeleton width="80px" height="0.625rem" />
          </div>
        ))}
      </div>

      {/* 필터 영역 */}
      <div className="flex gap-2">
        <Skeleton width="100%" height="2.75rem" rounded="xl" className="flex-1" />
        <Skeleton width="2.75rem" height="2.75rem" rounded="xl" />
      </div>

      {/* 탭 바 */}
      <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-1.5">
        <div className="flex gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex-1 flex flex-col items-center py-2">
              <Skeleton width="1.25rem" height="1.25rem" rounded="full" />
              <Skeleton width="1rem" height="0.75rem" className="mt-1" />
            </div>
          ))}
        </div>
      </div>

      {/* 칸반 컬럼 */}
      <KanbanColumnSkeleton cardCount={2} />
    </div>
  );
}

/**
 * 리스트 뷰 스켈레톤
 */
export function ListViewSkeleton({ rowCount = 5 }: { rowCount?: number }) {
  return (
    <div
      className="rounded-3xl border border-white/10 bg-white/5 p-5"
      aria-hidden="true"
    >
      {/* 헤더 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton width="80px" height="0.625rem" />
          <Skeleton width="100px" height="0.875rem" />
        </div>
        <Skeleton width="60px" height="0.75rem" />
      </div>

      {/* 테이블 헤더 */}
      <div className="flex gap-4 border-b border-white/10 pb-3">
        <Skeleton width="150px" height="0.75rem" />
        <Skeleton width="80px" height="0.75rem" />
        <Skeleton width="80px" height="0.75rem" />
        <Skeleton width="80px" height="0.75rem" />
      </div>

      {/* 테이블 로우 */}
      <div className="space-y-0">
        {Array.from({ length: rowCount }, (_, i) => (
          <div
            key={i}
            className="flex gap-4 items-center py-3 border-b border-white/5"
          >
            <Skeleton width="150px" height="0.875rem" />
            <Skeleton width="60px" height="1.5rem" rounded="full" />
            <Skeleton width="80px" height="0.75rem" />
            <Skeleton width="80px" height="0.75rem" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 팀 카드 스켈레톤
 */
export function TeamCardSkeleton() {
  return (
    <div
      className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 space-y-3"
      aria-hidden="true"
    >
      {/* 역할 라벨 */}
      <Skeleton width="60px" height="0.75rem" rounded="md" />

      {/* 팀 이름 */}
      <Skeleton width="70%" height="1.5rem" rounded="md" className="mt-3" />

      {/* 설명 */}
      <SkeletonText lines={2} className="mt-2" />

      {/* 링크 */}
      <Skeleton width="100px" height="0.875rem" rounded="md" className="mt-6" />
    </div>
  );
}

/**
 * 팀 목록 스켈레톤
 */
export function TeamListSkeleton({ cardCount = 3 }: { cardCount?: number }) {
  return (
    <div className="grid gap-4" aria-hidden="true" role="status" aria-label="팀 목록 로딩 중">
      {Array.from({ length: cardCount }, (_, i) => (
        <TeamCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * 팀 목록 헤더 스켈레톤 (인증 상태 확인 전 표시)
 */
export function TeamsHeaderSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton width="60px" height="0.625rem" className="mb-4" />
      <div className="flex flex-col gap-4">
        <div>
          <Skeleton width="160px" height="2rem" />
          <Skeleton width="250px" height="0.875rem" className="mt-3" />
        </div>
        <Skeleton width="100%" height="3rem" rounded="xl" />
      </div>
    </div>
  );
}

/**
 * 팀 목록 페이지 전체 스켈레톤
 */
export function TeamsPageSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true" role="status" aria-label="로딩 중">
      {/* 헤더 섹션 */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-4">
        <TeamsHeaderSkeleton />
      </div>

      {/* 팀 목록 섹션 */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-4">
        <TeamListSkeleton cardCount={3} />
      </div>
    </div>
  );
}

/**
 * 팀/태스크 폼 스켈레톤 (수정 페이지 로딩용)
 */
export function FormPageSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true" role="status" aria-label="로딩 중">
      {/* 뒤로가기 버튼 */}
      <Skeleton width="180px" height="2.5rem" rounded="full" />

      {/* 폼 섹션 */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6">
        {/* 헤더 */}
        <div className="mb-4 sm:mb-6">
          <Skeleton width="80px" height="0.625rem" />
          <Skeleton width="150px" height="2rem" className="mt-3 sm:mt-4" />
        </div>

        {/* 입력 필드들 */}
        <div className="space-y-4 sm:space-y-6">
          {/* 이름 입력 */}
          <div>
            <Skeleton width="80px" height="0.875rem" className="mb-2" />
            <Skeleton width="100%" height="3rem" rounded="xl" />
          </div>

          {/* 설명 입력 */}
          <div>
            <Skeleton width="60px" height="0.875rem" className="mb-2" />
            <Skeleton width="100%" height="8rem" rounded="xl" />
          </div>

          {/* 버튼 영역 */}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-4 pt-2 sm:pt-4">
            <Skeleton width="80px" height="2.5rem" rounded="full" />
            <Skeleton width="100px" height="2.5rem" rounded="full" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 마이페이지 스켈레톤
 */
export function MypageSkeleton() {
  return (
    <div
      className="w-full max-w-[430px] bg-gradient-to-br from-slate-900/95 to-slate-900/75 border border-slate-400/25 rounded-[28px] p-11 text-center space-y-4"
      aria-hidden="true"
      role="status"
      aria-label="사용자 정보 로딩 중"
    >
      {/* 아바타 */}
      <Skeleton
        width="5rem"
        height="5rem"
        rounded="full"
        className="mx-auto"
      />

      {/* 환영 메시지 */}
      <Skeleton width="80px" height="0.625rem" className="mx-auto" />

      {/* 이름 */}
      <Skeleton width="150px" height="2rem" className="mx-auto" />

      {/* 사용자 번호 */}
      <Skeleton width="200px" height="1rem" className="mx-auto" />

      {/* 버튼 */}
      <Skeleton width="100%" height="3.5rem" rounded="full" className="mt-4" />
    </div>
  );
}
