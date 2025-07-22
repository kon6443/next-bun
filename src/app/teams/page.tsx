"use client";

import { useState } from "react";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Column } from "../components/Column";

const initialTasks = {
  todo: [
    { id: "1", title: "Task 1" },
    { id: "2", title: "Task 2" },
  ],
  inProgress: [{ id: "3", title: "Task 3" }],
  done: [{ id: "4", title: "Task 4" }],
};

const TeamsPage = () => {
  const [tasks, setTasks] = useState(initialTasks);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    const activeContainer = active.data.current?.sortable
      .containerId as keyof typeof tasks;
    const overContainer = (over.data.current?.sortable.containerId ||
      over.id) as keyof typeof tasks;

    if (
      !activeContainer ||
      !overContainer ||
      !tasks[activeContainer] ||
      !tasks[overContainer]
    ) {
      return;
    }

    if (activeContainer === overContainer) {
      const activeIndex = active.data.current?.sortable.index;
      const overIndex = over.data.current?.sortable.index;

      if (
        activeIndex !== undefined &&
        overIndex !== undefined &&
        activeIndex !== overIndex
      ) {
        setTasks((prev) => {
          const items = prev[activeContainer];
          return {
            ...prev,
            [activeContainer]: arrayMove(items, activeIndex, overIndex),
          };
        });
      }
    } else {
      const activeIndex = active.data.current?.sortable.index;

      if (activeIndex !== undefined) {
        setTasks((prev) => {
          const activeItems = prev[activeContainer];
          const overItems = prev[overContainer];
          const overIndex =
            over.data.current?.sortable.index ?? overItems.length;

          const newActiveItems = [...activeItems];
          const [movedItem] = newActiveItems.splice(activeIndex, 1);
          const newOverItems = [...overItems];
          newOverItems.splice(overIndex, 0, movedItem);

          return {
            ...prev,
            [activeContainer]: newActiveItems,
            [overContainer]: newOverItems,
          };
        });
      }
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
