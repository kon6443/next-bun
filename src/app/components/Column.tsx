import { useDroppable } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";

import { TaskCard } from "./TaskCard";
import type { Task } from "../types/task";

type ColumnProps = {
  id: string;
  title: string;
  helper?: string;
  accent: string;
  tasks: Task[];
};

export function Column({
  id,
  title,
  helper = "팀과 공유 중인 작업",
  accent,
  tasks,
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`group relative flex flex-1 flex-col rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_25px_60px_rgba(15,23,42,0.55)] backdrop-blur-xl transition-all duration-200 ${
        isOver ? "ring-2 ring-sky-400/60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.4em] text-slate-400">
            {title}
          </p>
          <p className="mt-1 text-sm text-slate-500">{helper}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-xs font-semibold text-slate-400">
            {tasks.length} tasks
          </span>
          <span
            className="h-10 w-10 rounded-2xl border border-white/20 shadow-inner"
            style={{ background: accent }}
            aria-hidden="true"
          />
        </div>
      </div>

      <SortableContext id={id} items={tasks.map((task) => String(task.taskId))}>
        <div
          className={`mt-6 flex-1 space-y-4 ${
            tasks.length === 0 ? "justify-center" : ""
          }`}
        >
          {tasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-600/80 px-4 py-10 text-center text-sm text-slate-500">
              드래그해서 카드를 추가하세요
            </div>
          ) : (
            tasks.map((task) => <TaskCard key={task.taskId} task={task} />)
          )}
        </div>
      </SortableContext>
    </div>
  );
}
