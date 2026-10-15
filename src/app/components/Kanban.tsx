'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
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
  // 가로 스크롤(스와이프·탭 이동) 중 높이 — 가장 긴 컬럼까지 늘어나 페이지 하단이 출렁이지 않게,
  // 지나가는 컬럼들(이웃·탭 이동 구간) 중 가장 높은 값으로만 잡고 멈춘 뒤 활성 컬럼 높이로 맞춘다
  const [isColumnScrolling, setIsColumnScrolling] = useState(false);
  const [scrollingHeight, setScrollingHeight] = useState<number | undefined>(undefined);
  const isColumnScrollingRef = useRef(false);
  const activeColumnIndexRef = useRef(activeColumnIndex);
  useEffect(() => {
    activeColumnIndexRef.current = activeColumnIndex;
  }, [activeColumnIndex]);

  const maxColumnHeight = useCallback((from: number, to: number) => {
    let max = 0;
    for (let i = Math.max(0, Math.min(from, to)); i <= Math.max(from, to); i++) {
      max = Math.max(max, columnRefs.current[i]?.offsetHeight ?? 0);
    }
    return max || undefined;
  }, []);

  // 페인트 전에 첫 높이를 잡는다 — 첫 프레임에 가장 긴 컬럼 높이였다가 줄어드는 점프를 없앤다
  useLayoutEffect(() => {
    const column = columnRefs.current[activeColumnIndex];
    if (!column) return;
    setActiveColumnHeight(column.offsetHeight);
    const observer = new ResizeObserver(() => setActiveColumnHeight(column.offsetHeight));
    observer.observe(column);
    return () => observer.disconnect();
  }, [activeColumnIndex]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handleScroll = () => {
      if (!isColumnScrollingRef.current) {
        isColumnScrollingRef.current = true;
        const current = activeColumnIndexRef.current;
        // 탭 이동은 scrollToColumn 이 구간 높이를 먼저 잡아 둔다 — 스와이프는 양옆 컬럼까지
        setScrollingHeight(prev => prev ?? maxColumnHeight(current - 1, current + 1));
        setIsColumnScrolling(true);
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        isColumnScrollingRef.current = false;
        setIsColumnScrolling(false);
        setScrollingHeight(undefined);
      }, 150);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      container.removeEventListener('scroll', handleScroll);
    };
  }, [maxColumnHeight]);

  // 마운트 시 복원된 컬럼으로 즉시 이동 (애니메이션 없이) — 페인트 전에 옮겨 0번 컬럼이 한 프레임 보이지 않게
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || activeColumnIndex === 0) return;
    container.scrollLeft = container.offsetWidth * activeColumnIndex;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회만, 이후 이동은 탭 클릭·스와이프가 담당
  }, []);

  useEffect(() => {
    onColumnChange?.(activeColumnIndex);
  }, [activeColumnIndex, onColumnChange]);

  // 탭 클릭으로 시작한 smooth 스크롤의 목표 위치 — 도착하면 스크롤 감지를 다시 켠다
  const scrollTargetLeftRef = useRef<number | null>(null);
  // 도착 이벤트를 놓쳤을 때(사용자가 중간에 손으로 밀었을 때 등)를 위한 안전 해제
  const scrollReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const releaseProgrammaticScroll = useCallback(() => {
    isScrollingRef.current = false;
    scrollTargetLeftRef.current = null;
    if (scrollReleaseTimerRef.current) clearTimeout(scrollReleaseTimerRef.current);
    scrollReleaseTimerRef.current = null;
  }, []);
  useEffect(() => releaseProgrammaticScroll, [releaseProgrammaticScroll]);

  // 탭 클릭 시 해당 컬럼으로 스크롤
  const scrollToColumn = useCallback((index: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const targetLeft = container.offsetWidth * index;
    // 같은 컬럼이면 스크롤 이벤트가 오지 않아 높이가 남지 않게 이동할 때만 잡는다
    if (Math.abs(container.scrollLeft - targetLeft) >= 2) {
      setScrollingHeight(maxColumnHeight(activeColumnIndexRef.current, index));
    }
    isScrollingRef.current = true;
    scrollTargetLeftRef.current = targetLeft;
    container.scrollTo({ left: targetLeft, behavior: 'smooth' });

    // 여러 컬럼을 건너뛰는 smooth 스크롤은 300ms보다 길다 — 고정 시간 대신 목표 도착으로 해제하고, 이건 안전장치다
    if (scrollReleaseTimerRef.current) clearTimeout(scrollReleaseTimerRef.current);
    scrollReleaseTimerRef.current = setTimeout(releaseProgrammaticScroll, 1000);

    setActiveColumnIndex(index);
  }, [releaseProgrammaticScroll, maxColumnHeight]);

  // 스크롤 이벤트로 현재 활성 컬럼 감지
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (isScrollingRef.current) {
        // 탭 클릭 스크롤 도중의 중간 위치로 활성 탭이 바뀌지 않게 하고, 목표에 닿으면 감지를 재개한다
        const target = scrollTargetLeftRef.current;
        if (target !== null && Math.abs(container.scrollLeft - target) < 2) releaseProgrammaticScroll();
        return;
      }

      const columnWidth = container.offsetWidth;
      const scrollLeft = container.scrollLeft;
      const newIndex = Math.round(scrollLeft / columnWidth);

      if (newIndex !== activeColumnIndex && newIndex >= 0 && newIndex < workflowStatuses.length) {
        setActiveColumnIndex(newIndex);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [activeColumnIndex, workflowStatuses.length, releaseProgrammaticScroll]);

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
        style={{ height: isColumnScrolling ? scrollingHeight : activeColumnHeight }}
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
                    {tasks.length}개
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
      <div className="flex justify-center py-1">
        {workflowStatuses.map((status, index) => (
          <button
            key={status.key}
            type="button"
            onClick={() => scrollToColumn(index)}
            // 점은 작게 그리고 터치 영역은 패딩으로 44px 확보
            className="group flex min-h-[44px] min-w-[44px] items-center justify-center"
            aria-label={`${status.label} 컬럼으로 이동`}
            aria-current={index === activeColumnIndex ? 'true' : undefined}
          >
            <span
              className={`block h-2 rounded-full transition-all duration-200 ${
                index === activeColumnIndex
                  ? 'w-6 bg-sky-500'
                  : 'w-2 bg-slate-600 group-hover:bg-slate-500'
              }`}
            />
          </button>
        ))}
      </div>

    </div>
  );
}
