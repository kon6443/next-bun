import { getStatusAccent } from '@/app/config/taskStatusConfig';

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

