"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import { Column } from "../../components/Column";
import type { Task } from "../../types/task";
import { getTeamTasks, updateTaskStatus } from "@/services/teamService";

type ColumnKey = "todo" | "inProgress" | "done";

const columnMeta: Record<
  ColumnKey,
  { title: string; helper: string; accent: string; taskStatus: number }
> = {
  todo: {
    title: "Ideation",
    helper: "아이디어 & 요청",
    accent: "linear-gradient(135deg, #facc15, #f97316)",
    taskStatus: 1, // CREATED
  },
  inProgress: {
    title: "In Progress",
    helper: "진행 중인 작업",
    accent: "linear-gradient(135deg, #38bdf8, #6366f1)",
    taskStatus: 2, // IN_PROGRESS
  },
  done: {
    title: "Completed",
    helper: "검수 완료",
    accent: "linear-gradient(135deg, #34d399, #10b981)",
    taskStatus: 3, // COMPLETED
  },
};

// taskStatus를 ColumnKey로 매핑
const taskStatusToColumn: Record<number, ColumnKey> = {
  1: "todo", // CREATED
  2: "inProgress", // IN_PROGRESS
  3: "done", // COMPLETED
};

type TeamBoardProps = {
  teamId: string;
};

export default function TeamBoard({ teamId }: TeamBoardProps) {
  const { data: session } = useSession();
  const [tasks, setTasks] = useState<Record<ColumnKey, Task[]>>({
    todo: [],
    inProgress: [],
    done: [],
  });
  const [teamName, setTeamName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // activationConstraint를 사용하여 클릭과 드래그 구분
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px 이상 이동해야 드래그 시작
      },
    })
  );

  useEffect(() => {
    if (!session?.user?.accessToken) {
      setError("인증이 필요합니다. 다시 로그인해주세요.");
      setIsLoading(false);
      return;
    }

    const fetchTeamTasks = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const teamIdNum = parseInt(teamId, 10);
        if (isNaN(teamIdNum)) {
          throw new Error("유효하지 않은 팀 ID입니다.");
        }

        const response = await getTeamTasks(teamIdNum, session.user.accessToken);
        setTeamName(response.data.team.teamName);

        // taskStatus에 따라 태스크를 컬럼별로 분류
        const classifiedTasks: Record<ColumnKey, Task[]> = {
          todo: [],
          inProgress: [],
          done: [],
        };

        response.data.tasks.forEach((task) => {
          // actStatus가 1(ACTIVE)인 태스크만 표시
          if (task.actStatus === 1) {
            const columnKey = taskStatusToColumn[task.taskStatus] || "todo";
            classifiedTasks[columnKey].push(task);
          }
        });

        setTasks(classifiedTasks);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "태스크 목록을 불러오는데 실패했습니다.";
        setError(errorMessage);
        console.error("Failed to fetch team tasks:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTeamTasks();
  }, [teamId, session?.user?.accessToken]);

  const totalTasks =
    tasks.todo.length + tasks.inProgress.length + tasks.done.length;
  const completionRate =
    totalTasks === 0 ? 0 : Math.round((tasks.done.length / totalTasks) * 100);

  const stats = [
    {
      label: "진행률",
      value: `${completionRate}%`,
      helper: "완료 대비 전체",
    },
    {
      label: "진행 중",
      value: tasks.inProgress.length,
      helper: "현재 집중 작업",
    },
    {
      label: "초기 아이디어",
      value: tasks.todo.length,
      helper: "대기 중 카드",
    },
  ];

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || !session?.user?.accessToken) return;

    const activeContainer = active.data.current?.sortable
      .containerId as ColumnKey;
    const overContainer = (over.data.current?.sortable.containerId ||
      over.id) as ColumnKey;

    if (
      !activeContainer ||
      !overContainer ||
      !tasks[activeContainer] ||
      !tasks[overContainer]
    ) {
      return;
    }

    const activeIndex = active.data.current?.sortable.index;
    if (activeIndex === undefined) return;

    const movedTask = tasks[activeContainer][activeIndex];
    if (!movedTask) return;

    // 같은 컬럼 내에서 이동하는 경우 (순서만 변경)
    if (activeContainer === overContainer) {
      const overIndex = over.data.current?.sortable.index;
      if (overIndex === undefined || activeIndex === overIndex) return;

      setTasks((prev) => {
        const items = prev[activeContainer];
        return {
          ...prev,
          [activeContainer]: arrayMove(items, activeIndex, overIndex),
        };
      });
    } else {
      // 다른 컬럼으로 이동하는 경우 (상태 변경)
      const overIndex =
        over.data.current?.sortable.index ?? tasks[overContainer].length;
      const newTaskStatus = columnMeta[overContainer].taskStatus;

      // 낙관적 업데이트
      setTasks((prev) => {
        const activeItems = [...prev[activeContainer]];
        const overItems = [...prev[overContainer]];
        const [movedItem] = activeItems.splice(activeIndex, 1);
        overItems.splice(overIndex, 0, {
          ...movedItem,
          taskStatus: newTaskStatus,
        });

        return {
          ...prev,
          [activeContainer]: activeItems,
          [overContainer]: overItems,
        };
      });

      // API 호출
      try {
        const teamIdNum = parseInt(teamId, 10);
        await updateTaskStatus(
          teamIdNum,
          movedTask.taskId,
          newTaskStatus,
          session.user.accessToken,
        );
      } catch (err) {
        // 실패 시 롤백
        console.error("Failed to update task status:", err);
        setError(err instanceof Error ? err.message : "태스크 상태 변경에 실패했습니다.");

        // 원래 상태로 복구
        setTasks((prev) => {
          const activeItems = [...prev[activeContainer]];
          const overItems = [...prev[overContainer]];
          overItems.splice(overIndex, 1);
          activeItems.splice(activeIndex, 0, movedTask);

          return {
            ...prev,
            [activeContainer]: activeItems,
            [overContainer]: overItems,
          };
        });
      }
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-0 h-72 w-72 rounded-full bg-indigo-600/30 blur-[130px]" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-sky-500/20 blur-[150px]" />
      </div>

      <main className="relative z-10 mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-24 pt-16 sm:px-8">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
          <p className="text-xs uppercase tracking-[0.6em] text-slate-400">
            Team Kanban
          </p>
          <div className="mt-4 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white md:text-5xl">
                {isLoading ? "로딩 중..." : teamName || "팀"} 작업 현황판
              </h1>
            </div>
            <div className="flex gap-4">
              <button className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/40">
                회의 로그 공유
              </button>
              <button className="rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:brightness-110">
                새 카드 작성
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/10 bg-slate-950/30 p-4"
              >
                <p className="text-xs uppercase tracking-[0.5em] text-slate-500">
                  {stat.label}
                </p>
                <p className="mt-3 text-3xl font-bold text-white">
                  {stat.value}
                </p>
                <p className="mt-1 text-sm text-slate-500">{stat.helper}</p>
              </div>
            ))}
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-center">
            <p className="text-base font-semibold text-red-400">{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl text-center text-slate-400">
            태스크 목록을 불러오는 중...
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            onDragEnd={handleDragEnd}
            collisionDetection={closestCenter}
          >
            <div className="grid gap-6 md:grid-cols-3">
              {(Object.keys(columnMeta) as ColumnKey[]).map((columnKey) => {
                const meta = columnMeta[columnKey];
                return (
                  <Column
                    key={columnKey}
                    id={columnKey}
                    title={meta.title}
                    helper={meta.helper}
                    accent={meta.accent}
                    tasks={tasks[columnKey]}
                  />
                );
              })}
            </div>
          </DndContext>
        )}
      </main>
    </div>
  );
}

