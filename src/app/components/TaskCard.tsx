import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { Task } from "../types/task";

type TaskCardProps = {
  task: Task;
};

export function TaskCard({ task }: TaskCardProps) {
  const { id, title, description, owner, eta, tag } = task;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

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
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        <span>{tag}</span>
        <span className="text-[0.65rem] font-normal tracking-normal text-slate-500">
          {eta}
        </span>
      </div>
      <h3 className="mt-3 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{description}</p>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-800 text-sm font-semibold text-slate-200">
            {owner.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{owner}</p>
            <p className="text-xs text-slate-500">담당자</p>
          </div>
        </div>
        <span className="text-xs font-semibold text-slate-400">드래그 가능</span>
      </div>
    </article>
  );
}
