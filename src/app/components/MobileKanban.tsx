'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Task } from '../types/task';
import { MobileTaskCard } from './MobileTaskCard';
import { getWorkflowStatuses, type ColumnKey } from '../config/taskStatusConfig';

type MobileKanbanProps = {
  tasksByColumn: Record<ColumnKey, Task[]>;
  onStatusChange: (taskId: number, newStatus: number) => Promise<void>;
  teamId: string;
};

export function MobileKanban({ tasksByColumn, onStatusChange, teamId }: MobileKanbanProps) {
  // 워크플로우 상태만 가져오기 (칸반 보드에 표시되는 상태)
  const workflowStatuses = getWorkflowStatuses();
  
  const [activeColumnIndex, setActiveColumnIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  // 상태 키를 컬럼 키로 매핑
  const statusKeyToColumnKey: Record<number, ColumnKey> = {
    1: 'todo',
    2: 'inProgress',
    3: 'done',
  };

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

      if (newIndex !== activeColumnIndex && newIndex >= 0 && newIndex < workflowStatuses.length) {
        setActiveColumnIndex(newIndex);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [activeColumnIndex, workflowStatuses.length]);

  return (
    <div className="flex flex-col h-full">
      {/* 상태 탭 바 */}
      <div className="flex rounded-2xl border border-white/10 bg-slate-950/50 p-1 mb-4">
        {workflowStatuses.map((status, index) => {
          const isActive = index === activeColumnIndex;
          const columnKey = statusKeyToColumnKey[status.key];
          const taskCount = tasksByColumn[columnKey]?.length || 0;

          return (
            <button
              key={status.key}
              onClick={() => scrollToColumn(index)}
              className={`flex-1 py-2.5 px-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-r from-indigo-500/20 to-sky-500/20 text-white border border-white/10'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <span className="block truncate">{status.label}</span>
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
        <div className="flex h-full" style={{ width: `${workflowStatuses.length * 100}%` }}>
          {workflowStatuses.map((status) => {
            const columnKey = statusKeyToColumnKey[status.key];
            const tasks = tasksByColumn[columnKey] || [];

            return (
              <div
                key={status.key}
                className="flex-shrink-0 px-1 mobile-kanban-column"
                style={{ width: `${100 / workflowStatuses.length}%` }}
              >
                {/* 컬럼 헤더 */}
                <div className="flex items-center justify-between mb-4 px-2">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-8 w-8 rounded-xl border border-white/20 shadow-inner"
                      style={{ background: status.accent }}
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-semibold text-white">{status.label}</p>
                      <p className="text-xs text-slate-500">{status.description}</p>
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
        {workflowStatuses.map((status, index) => (
          <button
            key={status.key}
            onClick={() => scrollToColumn(index)}
            className={`h-2 rounded-full transition-all duration-200 ${
              index === activeColumnIndex
                ? 'w-6 bg-sky-500'
                : 'w-2 bg-slate-600 hover:bg-slate-500'
            }`}
            aria-label={`${status.label} 컬럼으로 이동`}
          />
        ))}
      </div>
    </div>
  );
}
