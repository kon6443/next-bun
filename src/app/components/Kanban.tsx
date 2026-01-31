'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Task } from '../types/task';
import { TaskCard } from './TaskCard';
import { getWorkflowStatuses, STATUS_TO_COLUMN, type ColumnKey } from '../config/taskStatusConfig';
import { EmptyState } from '../teams/components';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons';

type KanbanProps = {
  tasksByColumn: Record<ColumnKey, Task[]>;
  onStatusChange: (taskId: number, newStatus: number) => Promise<void>;
  teamId: string;
};

const SWIPE_HINT_STORAGE_KEY = 'kanban-swipe-hint-shown';

/**
 * 탭 기반 칸반 보드 컴포넌트
 * PC/모바일 모두에서 동일한 UX 제공 (스와이프 또는 탭 클릭으로 컬럼 전환)
 */
export function Kanban({ tasksByColumn, onStatusChange, teamId }: KanbanProps) {
  // 워크플로우 상태만 가져오기 (칸반 보드에 표시되는 상태)
  const workflowStatuses = getWorkflowStatuses();
  
  const [activeColumnIndex, setActiveColumnIndex] = useState(0);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  // 첫 방문 시 스와이프 힌트 표시
  useEffect(() => {
    // localStorage 체크는 클라이언트에서만 실행
    const hasSeenHint = localStorage.getItem(SWIPE_HINT_STORAGE_KEY);
    if (!hasSeenHint) {
      // 잠시 후 힌트 애니메이션 시작
      const timer = setTimeout(() => {
        setShowSwipeHint(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  // 스와이프 힌트 닫기 및 localStorage에 저장
  const dismissSwipeHint = useCallback(() => {
    setShowSwipeHint(false);
    localStorage.setItem(SWIPE_HINT_STORAGE_KEY, 'true');
  }, []);

  // 상태 키를 컬럼 키로 매핑 (config에서 가져옴)
  const statusKeyToColumnKey = STATUS_TO_COLUMN;

  // 탭 클릭 시 해당 컬럼으로 스크롤
  const scrollToColumn = useCallback((index: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // 스와이프 힌트가 있으면 닫기
    if (showSwipeHint) {
      dismissSwipeHint();
    }

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
  }, [showSwipeHint, dismissSwipeHint]);

  // 스크롤 이벤트로 현재 활성 컬럼 감지
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (isScrollingRef.current) return;

      // 스와이프 힌트가 있으면 닫기 (사용자가 직접 스와이프 함)
      if (showSwipeHint) {
        dismissSwipeHint();
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
  }, [activeColumnIndex, workflowStatuses.length, showSwipeHint, dismissSwipeHint]);

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

      {/* 스와이프 힌트 오버레이 */}
      {showSwipeHint && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={dismissSwipeHint}
        >
          <div 
            className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-slate-800/90 border border-white/10 shadow-2xl max-w-xs mx-4 animate-in zoom-in-95 duration-300"
            onClick={e => e.stopPropagation()}
          >
            {/* 스와이프 애니메이션 아이콘 */}
            <div className="relative flex items-center justify-center w-24 h-16">
              <div className="swipe-hint-hand">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center shadow-lg">
                  <ChevronLeftIcon className="w-5 h-5 text-white opacity-80" />
                  <ChevronRightIcon className="w-5 h-5 text-white opacity-80 -ml-2" />
                </div>
              </div>
            </div>
            
            {/* 힌트 텍스트 */}
            <div className="text-center">
              <p className="text-sm font-semibold text-white">좌우로 스와이프하세요</p>
              <p className="text-xs text-slate-400 mt-1">다른 상태의 태스크를 볼 수 있어요</p>
            </div>

            {/* 확인 버튼 */}
            <button
              onClick={dismissSwipeHint}
              className="w-full mt-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold transition-colors"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* 스와이프 힌트 애니메이션 스타일 */}
      <style jsx>{`
        @keyframes swipeHint {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-12px); }
          75% { transform: translateX(12px); }
        }
        .swipe-hint-hand {
          animation: swipeHint 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
