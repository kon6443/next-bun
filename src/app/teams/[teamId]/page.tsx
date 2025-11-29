"use client";

import { useState } from "react";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import { Column } from "../../components/Column";
import type { Task } from "../../types/task";

type ColumnKey = "todo" | "inProgress" | "done";

const columnMeta: Record<
  ColumnKey,
  { title: string; helper: string; accent: string }
> = {
  todo: {
    title: "Ideation",
    helper: "아이디어 & 요청",
    accent: "linear-gradient(135deg, #facc15, #f97316)",
  },
  inProgress: {
    title: "In Progress",
    helper: "진행 중인 작업",
    accent: "linear-gradient(135deg, #38bdf8, #6366f1)",
  },
  done: {
    title: "Completed",
    helper: "검수 완료",
    accent: "linear-gradient(135deg, #34d399, #10b981)",
  },
};

const initialTasks: Record<ColumnKey, Task[]> = {
  todo: [
    {
      id: "1",
      title: "온보딩 플로우 와이어프레임",
      description: "신규 가입자 전용 온보딩 경험을 3단계로 축소합니다.",
      owner: "이재훈",
      eta: "Due 12/01",
      tag: "Design",
    },
    {
      id: "2",
      title: "팀 공유용 슬라이드",
      description: "2025 로드맵 공유 슬라이드를 ESG 메시지와 함께 업데이트.",
      owner: "한유림",
      eta: "Due 12/04",
      tag: "Planning",
    },
  ],
  inProgress: [
    {
      id: "3",
      title: "캘린더 연동 API",
      description: "구글 캘린더 동기화 API 안정화 및 에러 로깅 강화.",
      owner: "박성민",
      eta: "Due 11/30",
      tag: "Dev",
    },
    {
      id: "5",
      title: "팀 위젯 테마",
      description: "다크 테마 대응을 위한 CSS 토큰 정리 및 QA.",
      owner: "김하늘",
      eta: "Due 12/02",
      tag: "UI",
    },
  ],
  done: [
    {
      id: "4",
      title: "유저 리서치 리포트",
      description: "10명의 핵심 사용자 인터뷰 보고서 정리 및 노션 게시.",
      owner: "정다인",
      eta: "완료",
      tag: "Insight",
    },
  ],
};

type TeamDetailPageProps = {
  params: {
    teamId: string;
  };
};

export default function TeamDetailPage({ params }: TeamDetailPageProps) {
  const [tasks, setTasks] = useState(initialTasks);
  const { teamId } = params;

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

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
                {decodeURIComponent(teamId)} 작업 현황판
              </h1>
              <p className="mt-3 max-w-2xl text-base text-slate-400">
                디자이너와 개발자가 함께 쓰는 보드입니다. 카드들을 끌어다 놓으면
                실시간으로 순서가 정리돼요.
              </p>
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

        <DndContext
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
      </main>
    </div>
  );
}

