import { SortableContext } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { TaskCard } from './TaskCard';

export function Column({ id, title, tasks }: { id: string; title: string; tasks: { id: string; title: string }[] }) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div ref={setNodeRef} className="w-full md:w-1/3 p-4 bg-gray-800 rounded-lg">
      <h2 className="text-lg font-bold mb-4 text-gray-200">{title}</h2>
      <SortableContext id={id} items={tasks}>
        <div className="space-y-4">
          {tasks.map((task) => (
            <TaskCard key={task.id} id={task.id} title={task.title} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}
