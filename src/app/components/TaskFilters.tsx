'use client';

import type { PeriodFilter, StatusFilter } from '../utils/taskUtils';

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
  };

  // 필터 초기화
  hasActiveFilters: boolean;
  onResetFilters: () => void;

  // 현재 로그인 사용자 ID (내 태스크만 보기 기능용)
  currentUserId?: number;
};

const periodOptions: { value: PeriodFilter; label: string }[] = [
  { value: 'all', label: '전체 기간' },
  { value: 'overdue', label: '지연됨' },
  { value: 'today', label: '오늘 마감' },
  { value: 'thisWeek', label: '이번 주' },
  { value: 'thisMonth', label: '이번 달' },
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
    <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* 검색 */}
        <div className="flex-1 max-w-md">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="태스크 검색..."
              className="w-full rounded-lg border border-white/10 bg-slate-900/50 pl-10 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
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
        </div>

        {/* 필터 그룹 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 내 태스크만 토글 */}
          {currentUserId && (
            <button
              onClick={handleMyTasksToggle}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                assigneeId === currentUserId
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'border border-white/10 bg-slate-900/50 text-slate-400 hover:bg-slate-800/50'
              }`}
            >
              내 태스크
            </button>
          )}

          {/* 담당자 필터 */}
          <select
            value={assigneeId ?? ''}
            onChange={e => onAssigneeChange(e.target.value === '' ? null : Number(e.target.value))}
            className="rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-xs text-slate-200 focus:border-white/20 focus:outline-none"
          >
            <option value="">모든 담당자</option>
            {assignees.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          {/* 상태 필터 */}
          <select
            value={status}
            onChange={e => onStatusChange(e.target.value === 'all' ? 'all' : Number(e.target.value) as StatusFilter)}
            className="rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-xs text-slate-200 focus:border-white/20 focus:outline-none"
          >
            <option value="all">전체 상태 ({taskCounts.total})</option>
            <option value="1">Ideation ({taskCounts.todo})</option>
            <option value="2">In Progress ({taskCounts.inProgress})</option>
            <option value="3">Completed ({taskCounts.done})</option>
          </select>

          {/* 기간 필터 */}
          <select
            value={period}
            onChange={e => onPeriodChange(e.target.value as PeriodFilter)}
            className="rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-xs text-slate-200 focus:border-white/20 focus:outline-none"
          >
            {periodOptions.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* 필터 초기화 */}
          {hasActiveFilters && (
            <button
              onClick={onResetFilters}
              className="rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-xs text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
            >
              초기화
            </button>
          )}
        </div>
      </div>
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
