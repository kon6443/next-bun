'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Task } from '../types/task';
import { MobileTaskCard } from './MobileTaskCard';

type ColumnKey = 'todo' | 'inProgress' | 'done';

type ColumnMeta = {
  key: ColumnKey;
  title: string;
  helper: string;
  accent: string;
  taskStatus: number;
};

const columns: ColumnMeta[] = [
  {
    key: 'todo',
    title: 'Ideation',
    helper: '아이디어 & 요청',
    accent: 'linear-gradient(135deg, #facc15, #f97316)',
    taskStatus: 1,
  },
  {
    key: 'inProgress',
    title: 'In Progress',
    helper: '진행 중인 작업',
    accent: 'linear-gradient(135deg, #38bdf8, #6366f1)',
    taskStatus: 2,
  },
  {
    key: 'done',
    title: 'Completed',
    helper: '검수 완료',
    accent: 'linear-gradient(135deg, #34d399, #10b981)',
    taskStatus: 3,
  },
];

type MobileKanbanProps = {
  tasksByColumn: Record<ColumnKey, Task[]>;
  onStatusChange: (taskId: number, newStatus: number) => Promise<void>;
  teamId: string;
};

export function MobileKanban({ tasksByColumn, onStatusChange, teamId }: MobileKanbanProps) {
  const [activeColumnIndex, setActiveColumnIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  // 탭 클릭 시 해당 컬럼으로 스크롤
  const scrollToColumn = useCallback((index: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    isScrollingRef.current = true;
    const columnWidth = container.offsetWidth;
    container.scrollTo({
      left: columnWidth * index,
      behavior: 'smooth',
    });

    // 스크롤 애니메이션 완료 후 플래그 해제
    setTimeout(() => {
      isScrollingRef.current = false;
    }, 300);

    setActiveColumnIndex(index);
  }, []);

  // 스크롤 이벤트로 현재 활성 컬럼 감지
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (isScrollingRef.current) return;

      const columnWidth = container.offsetWidth;
      const scrollLeft = container.scrollLeft;
      const newIndex = Math.round(scrollLeft / columnWidth);

      if (newIndex !== activeColumnIndex && newIndex >= 0 && newIndex < columns.length) {
        setActiveColumnIndex(newIndex);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [activeColumnIndex]);

  const activeColumn = columns[activeColumnIndex];
  const activeTasks = tasksByColumn[activeColumn.key];

  return (
    <div className="flex flex-col h-full">
      {/* 상태 탭 바 */}
      <div className="flex rounded-2xl border border-white/10 bg-slate-950/50 p-1 mb-4">
        {columns.map((col, index) => {
          const isActive = index === activeColumnIndex;
          const taskCount = tasksByColumn[col.key].length;

          return (
            <button
              key={col.key}
              onClick={() => scrollToColumn(index)}
              className={`flex-1 py-2.5 px-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-r from-indigo-500/20 to-sky-500/20 text-white border border-white/10'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <span className="block truncate">{col.title}</span>
              <span className={`block text-[10px] mt-0.5 ${isActive ? 'text-sky-400' : 'text-slate-500'}`}>
                {taskCount}개
              </span>
            </button>
          );
        })}
      </div>

      {/* 스와이프 가능한 컬럼 컨테이너 */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-hide mobile-kanban-container"
      >
        <div className="flex h-full" style={{ width: `${columns.length * 100}%` }}>
          {columns.map((col) => {
            const tasks = tasksByColumn[col.key];

            return (
              <div
                key={col.key}
                className="flex-shrink-0 px-1 mobile-kanban-column"
                style={{ width: `${100 / columns.length}%` }}
              >
                {/* 컬럼 헤더 */}
                <div className="flex items-center justify-between mb-4 px-2">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-8 w-8 rounded-xl border border-white/20 shadow-inner"
                      style={{ background: col.accent }}
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-semibold text-white">{col.title}</p>
                      <p className="text-xs text-slate-500">{col.helper}</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-slate-400">
                    {tasks.length} tasks
                  </span>
                </div>

                {/* 태스크 목록 (세로 스크롤) */}
                <div className="overflow-y-auto pr-1" style={{ maxHeight: 'calc(100vh - 400px)' }}>
                  <div className="space-y-3 pb-4">
                    {tasks.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-600/80 px-4 py-10 text-center text-sm text-slate-500">
                        태스크가 없습니다
                      </div>
                    ) : (
                      tasks.map((task) => (
                        <MobileTaskCard
                          key={task.taskId}
                          task={task}
                          onStatusChange={onStatusChange}
                          teamId={teamId}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 스와이프 인디케이터 */}
      <div className="flex justify-center gap-2 py-4">
        {columns.map((col, index) => (
          <button
            key={col.key}
            onClick={() => scrollToColumn(index)}
            className={`h-2 rounded-full transition-all duration-200 ${
              index === activeColumnIndex
                ? 'w-6 bg-sky-500'
                : 'w-2 bg-slate-600 hover:bg-slate-500'
            }`}
            aria-label={`${col.title} 컬럼으로 이동`}
          />
        ))}
      </div>
    </div>
  );
}
