'use client';

import { useState } from 'react';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext } from '@dnd-kit/sortable';
import { Column } from '../components/Column';

const initialTasks = {
  todo: [
    { id: '1', title: 'Task 1' },
    { id: '2', title: 'Task 2' },
  ],
  inProgress: [{ id: '3', title: 'Task 3' }],
  done: [{ id: '4', title: 'Task 4' }],
};

const TeamsPage = () => {
  const [tasks, setTasks] = useState(initialTasks);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    const activeContainer = active.data.current?.sortable.containerId;
    const overContainer = over.data.current?.sortable.containerId || over.id;

    if (activeContainer === overContainer) {
      setTasks((prev) => ({
        ...prev,
        [activeContainer]: arrayMove(prev[activeContainer], active.data.current?.sortable.index, over.data.current?.sortable.index || 0),
      }));
    } else {
      const activeItems = tasks[activeContainer];
      const overItems = tasks[overContainer];
      const activeIndex = active.data.current?.sortable.index;
      const overIndex = over.data.current?.sortable.index || 0;

      const [movedItem] = activeItems.splice(activeIndex, 1);
      overItems.splice(overIndex, 0, movedItem);

      setTasks((prev) => ({
        ...prev,
        [activeContainer]: [...activeItems],
        [overContainer]: [...overItems],
      }));
    }
  };

  return (
    <DndContext onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
      <div className="flex space-x-4 p-4">
        <Column id="todo" title="준비중" tasks={tasks.todo} />
        <Column id="inProgress" title="작업중" tasks={tasks.inProgress} />
        <Column id="done" title="완료" tasks={tasks.done} />
      </div>
    </DndContext>
  );
};

export default TeamsPage;