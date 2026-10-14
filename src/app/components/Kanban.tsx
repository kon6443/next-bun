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
  isArchiveView?: boolean;
  onRestore?: (taskId: number) => Promise<void>;
  onArchive?: (taskId: number) => Promise<void>;
  /** 처음 보여줄 컬럼 (보드 상태 복원용) */
  initialColumnIndex?: number;
  /** 활성 컬럼이 바뀔 때 (보드 상태 저장용) */
  onColumnChange?: (index: number) => void;
};

/**
 * 탭 기반 칸반 보드 컴포넌트
 * PC/모바일 모두에서 동일한 UX 제공 (스와이프 또는 탭 클릭으로 컬럼 전환)
 */
export function Kanban({ tasksByColumn, onStatusChange, teamId, isArchiveView, onRestore, onArchive, initialColumnIndex = 0, onColumnChange }: KanbanProps) {
  // 워크플로우 상태만 가져오기 (칸반 보드에 표시되는 상태)
  const workflowStatuses = getWorkflowStatuses();

  const [activeColumnIndex, setActiveColumnIndex] = useState(() =>
    Math.min(Math.max(initialColumnIndex, 0), workflowStatuses.length - 1),
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  // 컨테이너 높이를 보이는 컬럼에 맞춘다 — 가장 긴 컬럼 높이로 늘어나 짧은 컬럼 아래가 빈 스크롤이 되지 않게
  const [activeColumnHeight, setActiveColumnHeight] = useState<number | undefined>(undefined);
  // 가로 스크롤(스와이프·탭 이동) 중에는 높이를 고정하지 않는다 — 넘어가는 컬럼이 잘리거나 페이지가 튀지 않게, 멈춘 뒤 맞춘다
  const [isColumnScrolling, setIsColumnScrolling] = useState(false);

  useEffect(() => {
    const column = columnRefs.current[activeColumnIndex];
    if (!column) return;
    const observer = new ResizeObserver(() => setActiveColumnHeight(column.offsetHeight));
    observer.observe(column);
    return () => observer.disconnect();
  }, [activeColumnIndex]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handleScroll = () => {
      setIsColumnScrolling(true);
      clearTimeout(timer);
      timer = setTimeout(() => setIsColumnScrolling(false), 150);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      container.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // 마운트 시 복원된 컬럼으로 즉시 이동 (애니메이션 없이)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || activeColumnIndex === 0) return;
    container.scrollLeft = container.offsetWidth * activeColumnIndex;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회만, 이후 이동은 탭 클릭·스와이프가 담당
  }, []);

  useEffect(() => {
    onColumnChange?.(activeColumnIndex);
  }, [activeColumnIndex, onColumnChange]);

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
            const columnKey = STATUS_TO_COLUMN[status.key];
            const taskCount = tasksByColumn[columnKey]?.length || 0;

            return (
              <button
                key={status.key}
                onClick={() => scrollToColumn(index)}
                aria-label={`${status.label} ${taskCount}개`}
                aria-current={isActive ? 'true' : undefined}
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
        className="overflow-x-auto overflow-y-hidden scrollbar-hide kanban-container"
        style={{ height: isColumnScrolling ? undefined : activeColumnHeight }}
      >
        <div className="flex items-start" style={{ width: `${workflowStatuses.length * 100}%` }}>
          {workflowStatuses.map((status, index) => {
            const columnKey = STATUS_TO_COLUMN[status.key];
            const tasks = tasksByColumn[columnKey] || [];

            return (
              <div
                key={status.key}
                ref={el => { columnRefs.current[index] = el; }}
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
                      <p className="text-xs text-slate-400">{status.description}</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-slate-400">
                    {tasks.length} tasks
                  </span>
                </div>

                {/* 태스크 목록 — 컬럼 내부 스크롤 없이 페이지 스크롤 하나로 본다 */}
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
                        isArchiveView={isArchiveView}
                        onRestore={onRestore}
                        onArchive={onArchive}
                      />
                    ))
                  )}
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
