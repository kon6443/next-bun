type TaskStatusBadgeProps = {
  status: number;
  /** 아이콘 크기: sm(8x8/10x10), md(10x10/12x12) */
  size?: "sm" | "md";
};

const taskStatusLabels: Record<number, string> = {
  1: "Ideation",
  2: "In Progress",
  3: "Completed",
  4: "On Hold",
  5: "Cancelled",
};

const taskStatusColors: Record<number, string> = {
  1: "linear-gradient(135deg, #facc15, #f97316)",
  2: "linear-gradient(135deg, #38bdf8, #6366f1)",
  3: "linear-gradient(135deg, #34d399, #10b981)",
  4: "linear-gradient(135deg, #fbbf24, #f59e0b)",
  5: "linear-gradient(135deg, #ef4444, #dc2626)",
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

  const color = taskStatusColors[status] || taskStatusColors[1];

  return (
    <span
      className={`${sizeClasses[size]} rounded-2xl border border-white/20 shadow-inner flex-shrink-0`}
      style={{ background: color }}
      aria-hidden="true"
    />
  );
}

// 외부에서 사용할 수 있도록 상수도 export
export { taskStatusLabels, taskStatusColors };
