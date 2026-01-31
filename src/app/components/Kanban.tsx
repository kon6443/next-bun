'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Task } from '../types/task';
import { TaskCard } from './TaskCard';
import { getWorkflowStatuses, STATUS_TO_COLUMN, type ColumnKey } from '../config/taskStatusConfig';
import { EmptyState } from '../teams/components';

type KanbanProps = {
  tasksByColumn: Record<ColumnKey, Task[]>;
  onStatusChange: (taskId: number, newStatus: number) => Promise<void>;
  teamId: string;
};

/**
 * 탭 기반 칸반 보드 컴포넌트
 * PC/모바일 모두에서 동일한 UX 제공 (스와이프 또는 탭 클릭으로 컬럼 전환)
 */
export function Kanban({ tasksByColumn, onStatusChange, teamId }: KanbanProps) {
  // 워크플로우 상태만 가져오기 (칸반 보드에 표시되는 상태)
  const workflowStatuses = getWorkflowStatuses();
  
  const [activeColumnIndex, setActiveColumnIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  // 상태 키를 컬럼 키로 매핑 (config에서 가져옴)
  const statusKeyToColumnKey = STATUS_TO_COLUMN;

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
      {/* 상태 탭 바 (아이콘 + 숫자) - 가로 스크롤 */}
      <div className="overflow-x-auto scrollbar-hide mb-4">
        <div className="flex gap-2 w-full rounded-2xl border border-white/10 bg-slate-950/50 p-1.5">
          {workflowStatuses.map((status, index) => {
            const isActive = index === activeColumnIndex;
            const columnKey = statusKeyToColumnKey[status.key];
            const taskCount = tasksByColumn[columnKey]?.length || 0;

            return (
              <button
                key={status.key}
                onClick={() => scrollToColumn(index)}
                className={`min-w-[56px] flex-1 flex flex-col items-center py-2 px-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-500/20 to-sky-500/20 border border-white/10 scale-105'
                    : 'hover:bg-white/5'
                }`}
              >
                {/* 상태 색상 아이콘 */}
                <span
                  className={`w-5 h-5 rounded-full border-2 shadow-inner ${
                    isActive ? 'border-white/40' : 'border-white/20'
                  }`}
                  style={{ background: status.accent }}
                  aria-hidden="true"
                />
                {/* 태스크 수 */}
                <span className={`text-xs font-bold mt-1 ${isActive ? 'text-white' : 'text-slate-500'}`}>
                  {taskCount}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 스와이프 가능한 컬럼 컨테이너 */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-hide kanban-container"
      >
        <div className="flex h-full" style={{ width: `${workflowStatuses.length * 100}%` }}>
          {workflowStatuses.map((status) => {
            const columnKey = statusKeyToColumnKey[status.key];
            const tasks = tasksByColumn[columnKey] || [];

            return (
              <div
                key={status.key}
                className="flex-shrink-0 px-1 kanban-column"
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

                {/* 태스크 목록 (세로 스크롤) - CSS 변수로 유연한 높이 계산 */}
                <div 
                  className="overflow-y-auto pr-1"
                  style={{ 
                    maxHeight: 'calc(100vh - var(--kanban-header-height, 350px) - var(--bottom-nav-height, 80px))'
                  }}
                >
                  <div className="space-y-3 pb-4">
                    {tasks.length === 0 ? (
                      <EmptyState message="태스크가 없습니다" variant="dashed" />
                    ) : (
                      tasks.map((task) => (
                        <TaskCard
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
