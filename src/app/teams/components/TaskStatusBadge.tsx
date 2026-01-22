import { getStatusLabel, getStatusAccent } from '@/app/config/taskStatusConfig';

type TaskStatusBadgeProps = {
  status: number;
  /** 아이콘 크기: sm(8x8/10x10), md(10x10/12x12) */
  size?: "sm" | "md";
};

/**
 * 태스크 상태 배지 컴포넌트 (아이콘만)
 * - 상태별 그라데이션 컬러 아이콘
 * 
 * 사용처: TaskDetailPage, TaskCard 등
 */
export function TaskStatusBadge({
  status,
  size = "md",
}: TaskStatusBadgeProps) {
  const sizeClasses = {
    sm: "h-8 w-8 sm:h-10 sm:w-10",
    md: "h-10 w-10 sm:h-12 sm:w-12",
  };

  const accent = getStatusAccent(status);

  return (
    <span
      className={`${sizeClasses[size]} rounded-2xl border border-white/20 shadow-inner flex-shrink-0`}
      style={{ background: accent }}
      aria-hidden="true"
    />
  );
}

// 하위 호환성을 위해 기존 상수도 export (deprecated - config 사용 권장)
/** @deprecated TASK_STATUS에서 직접 가져오세요 */
export const taskStatusLabels: Record<number, string> = {
  1: getStatusLabel(1),
  2: getStatusLabel(2),
  3: getStatusLabel(3),
  4: getStatusLabel(4),
  5: getStatusLabel(5),
};

/** @deprecated TASK_STATUS에서 직접 가져오세요 */
export const taskStatusColors: Record<number, string> = {
  1: getStatusAccent(1),
  2: getStatusAccent(2),
  3: getStatusAccent(3),
  4: getStatusAccent(4),
  5: getStatusAccent(5),
};
