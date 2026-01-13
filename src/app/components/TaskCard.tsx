import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { Task } from "../types/task";

type TaskCardProps = {
  task: Task;
};

export function TaskCard({ task }: TaskCardProps) {
  const { taskId, taskName, taskDescription, endAt } = task;
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

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`rounded-2xl border border-white/10 bg-slate-900/60 p-4 shadow-[0_15px_45px_rgba(15,23,42,0.55)] transition-all duration-200 ${
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
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          {taskDescription}
        </p>
      )}

      <div className="mt-4 flex items-center justify-end">
        <span className="text-xs font-semibold text-slate-400">드래그 가능</span>
      </div>
    </article>
  );
}
