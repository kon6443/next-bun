import { ClockIcon, CalendarIcon } from "@/app/components/Icons";
import { formatCompactDateTime } from "@/app/utils/taskUtils";

type DateInfoInlineProps = {
  /** 생성일 */
  crtdAt: Date;
  /** 시작일 (선택) */
  startAt?: Date | null;
  /** 종료일 (선택) */
  endAt?: Date | null;
  /** 크기: sm(TaskCard용), md(TaskDetailPage용) */
  size?: "sm" | "md";
};

const sizeStyles = {
  sm: {
    container: "text-[0.65rem] text-slate-500",
    icon: "w-3 h-3",
    iconGap: "gap-1",
    divider: "text-slate-600",
  },
  md: {
    container: "text-xs text-slate-400",
    icon: "w-3.5 h-3.5",
    iconGap: "gap-1.5",
    divider: "text-slate-600",
  },
} as const;

/**
 * 날짜 정보를 인라인으로 표시하는 컴포넌트
 * - 생성일, 시작일, 종료일을 아이콘과 함께 표시
 * - TaskCard, TaskDetailPage 등에서 공통으로 사용
 */
export function DateInfoInline({
  crtdAt,
  startAt,
  endAt,
  size = "sm",
}: DateInfoInlineProps) {
  const styles = sizeStyles[size];

  const crtdDateStr = formatCompactDateTime(crtdAt);
  const startDateStr = startAt ? formatCompactDateTime(startAt) : null;
  const endDateStr = endAt ? formatCompactDateTime(endAt) : null;

  const hasDateRange = startDateStr || endDateStr;

  return (
    <div className={`w-full flex flex-wrap items-center justify-between gap-y-2 ${styles.container}`}>
      {/* 생성일 */}
      <span className={`flex items-center ${styles.iconGap}`} title="생성일">
        <ClockIcon className={styles.icon} />
        <span>{crtdDateStr}</span>
      </span>

      {/* 구분자 (시작일 또는 종료일이 있을 때) */}
      {hasDateRange && <span className={styles.divider}>·</span>}

      {/* 시작일 */}
      {startDateStr && (
        <span className={`flex items-center ${styles.iconGap}`} title="시작일">
          <CalendarIcon className={styles.icon} />
          <span>{startDateStr}</span>
        </span>
      )}

      {/* 화살표 (시작일과 종료일 모두 있을 때) */}
      {startDateStr && endDateStr && <span className={styles.divider}>→</span>}

      {/* 종료일 */}
      {endDateStr && (
        <span className={`flex items-center ${styles.iconGap}`} title="종료일">
          <CalendarIcon className={styles.icon} />
          <span>{endDateStr}</span>
        </span>
      )}
    </div>
  );
}
