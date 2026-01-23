'use client';

import { useState } from 'react';
import type { PeriodFilter, StatusFilter } from '../utils/taskUtils';
import { getAllStatuses } from '../config/taskStatusConfig';

type TaskFiltersProps = {
  // 검색
  searchQuery: string;
  onSearchChange: (query: string) => void;

  // 담당자 필터
  assigneeId: number | null;
  onAssigneeChange: (id: number | null) => void;
  assignees: { id: number; name: string }[];

  // 기간 필터
  period: PeriodFilter;
  onPeriodChange: (period: PeriodFilter) => void;

  // 상태 필터
  status: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;

  // 태스크 수 (상태별)
  taskCounts: {
    total: number;
    todo: number;
    inProgress: number;
    done: number;
    onHold: number;
    cancelled: number;
  };

  // 필터 초기화
  hasActiveFilters: boolean;
  onResetFilters: () => void;

  // 현재 로그인 사용자 ID (내 태스크만 보기 기능용)
  currentUserId?: number;
};

const periodOptions: { value: PeriodFilter; label: string; shortLabel: string }[] = [
  { value: 'all', label: '전체 기간', shortLabel: '전체' },
  { value: 'overdue', label: '지연됨', shortLabel: '지연' },
  { value: 'today', label: '오늘 마감', shortLabel: '오늘' },
  { value: 'thisWeek', label: '이번 주', shortLabel: '이번주' },
  { value: 'thisMonth', label: '이번 달', shortLabel: '이번달' },
];

export function TaskFilters({
  searchQuery,
  onSearchChange,
  assigneeId,
  onAssigneeChange,
  assignees,
  period,
  onPeriodChange,
  status,
  onStatusChange,
  taskCounts,
  hasActiveFilters,
  onResetFilters,
  currentUserId,
}: TaskFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleMyTasksToggle = () => {
    if (currentUserId) {
      if (assigneeId === currentUserId) {
        onAssigneeChange(null);
      } else {
        onAssigneeChange(currentUserId);
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {/* 검색창 */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="태스크 검색..."
            className="w-full rounded-xl border border-white/10 bg-slate-900/50 pl-10 pr-10 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* 필터 토글 버튼 */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`p-2.5 rounded-xl transition ${
            isExpanded || hasActiveFilters
              ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
              : 'border border-white/10 bg-slate-900/50 text-slate-400 hover:bg-slate-800/50'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        </button>

        {/* 활성 필터 카운트 */}
        {hasActiveFilters && !isExpanded && (
          <span className="text-xs text-sky-400">
            {[
              assigneeId !== null,
              status !== 'all',
              period !== 'all',
            ].filter(Boolean).length}개 필터
          </span>
        )}
      </div>

      {/* 펼쳐진 필터 영역 */}
      {isExpanded && (
        <div className="rounded-xl border border-white/10 bg-slate-900/30 p-4 space-y-4">
          {/* 내 태스크 + 담당자 */}
          <div className="flex gap-2">
            {currentUserId && (
              <button
                onClick={handleMyTasksToggle}
                className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition ${
                  assigneeId === currentUserId
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                    : 'border border-white/10 bg-slate-900/50 text-slate-400 hover:bg-slate-800/50'
                }`}
              >
                내 태스크
              </button>
            )}
            <select
              value={assigneeId ?? ''}
              onChange={e => onAssigneeChange(e.target.value === '' ? null : Number(e.target.value))}
              className="flex-1 px-3 py-2.5 rounded-lg border border-white/10 bg-slate-900/50 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">모든 담당자</option>
              {assignees.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* 상태 버튼 그리드 */}
          <div>
            <label className="block text-[10px] text-slate-500 mb-2">상태</label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => onStatusChange('all')}
                className={`py-2 rounded-lg text-xs font-medium transition ${
                  status === 'all'
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                    : 'border border-white/10 bg-slate-900/50 text-slate-400 hover:bg-slate-800/50'
                }`}
              >
                전체 ({taskCounts.total})
              </button>
              {getAllStatuses().slice(0, 5).map(s => {
                const counts = [taskCounts.todo, taskCounts.inProgress, taskCounts.done, taskCounts.onHold, taskCounts.cancelled];
                return (
                  <button
                    key={s.key}
                    onClick={() => onStatusChange(s.key)}
                    className={`py-2 rounded-lg text-xs font-medium transition ${
                      status === s.key
                        ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                        : 'border border-white/10 bg-slate-900/50 text-slate-400 hover:bg-slate-800/50'
                    }`}
                  >
                    {s.shortLabel} ({counts[s.key - 1]})
                  </button>
                );
              })}
            </div>
          </div>

          {/* 기간 버튼 */}
          <div>
            <label className="block text-[10px] text-slate-500 mb-2">기간</label>
            <div className="flex gap-1.5 flex-wrap">
              {periodOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => onPeriodChange(opt.value)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition ${
                    period === opt.value
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                      : 'border border-white/10 bg-slate-900/50 text-slate-400 hover:bg-slate-800/50'
                  }`}
                >
                  {opt.shortLabel}
                </button>
              ))}
            </div>
          </div>

          {/* 초기화 버튼 */}
          {hasActiveFilters && (
            <button
              onClick={onResetFilters}
              className="w-full py-2.5 rounded-lg border border-white/10 bg-slate-900/50 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            >
              필터 초기화
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// 마감일 상태 배지 컴포넌트 (공통 사용)
export function DeadlineBadge({
  status,
  label,
  size = 'sm',
}: {
  status: 'overdue' | 'today' | 'soon' | 'normal' | 'none';
  label: string;
  size?: 'sm' | 'xs';
}) {
  if (status === 'normal' || status === 'none') return null;

  const styles = {
    overdue: 'bg-red-500/20 text-red-400 border-red-500/30',
    today: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    soon: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    normal: '',
    none: '',
  };

  const sizeStyles = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-1.5 py-0.5 text-[9px]';

  return (
    <span className={`inline-block rounded border font-semibold ${styles[status]} ${sizeStyles}`}>
      {label}
    </span>
  );
}
