import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";

import type { Task } from "../types/task";

type TaskCardProps = {
  task: Task;
};

export function TaskCard({ task }: TaskCardProps) {
  const { taskId, taskName, taskDescription, endAt, teamId, userName, crtdBy } = task;
  const router = useRouter();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(taskId) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const formatDate = (date: Date | null) => {
    if (!date) return null;
    const d = new Date(date);
    return d.toLocaleDateString("ko-KR", {
      month: "short",
      day: "numeric",
    });
  };

  const endDateStr = endAt ? formatDate(endAt) : null;

  const handleClick = (e: React.MouseEvent) => {
    // 드래그 중이 아닐 때만 클릭 처리
    // activationConstraint로 인해 8px 미만의 이동은 클릭으로 처리됨
    if (!isDragging) {
      e.preventDefault();
      e.stopPropagation();
      router.push(`/teams/${teamId}/tasks/${taskId}`);
    }
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={`cursor-pointer rounded-2xl border border-white/10 bg-slate-900/60 p-4 shadow-[0_15px_45px_rgba(15,23,42,0.55)] transition-all duration-200 ${
        isDragging
          ? "scale-[1.01] ring-2 ring-sky-400/60"
          : "hover:-translate-y-0.5"
      }`}
    >
      {endDateStr && (
        <div className="flex items-center justify-end text-xs text-slate-500">
          <span className="text-[0.65rem] font-normal tracking-normal">
            {endDateStr}
          </span>
        </div>
      )}
      <h3 className="mt-3 text-lg font-semibold text-white">{taskName}</h3>
      {taskDescription && (
        <p className="mt-2 text-sm leading-relaxed text-slate-400 line-clamp-3 whitespace-pre-wrap">
          {taskDescription}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-slate-500 truncate max-w-[60%]">
          {userName || `사용자 ${crtdBy}`}
        </span>
        <span className="text-xs font-semibold text-slate-400 flex-shrink-0">드래그 가능</span>
      </div>
    </article>
  );
}
