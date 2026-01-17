import type { Task } from '../types/task';

// 마감일 상태 타입
export type DeadlineStatus = 'overdue' | 'today' | 'soon' | 'normal' | 'none';

// 기간 필터 타입
export type PeriodFilter = 'all' | 'today' | 'thisWeek' | 'thisMonth' | 'overdue';

// 상태 필터 타입
export type StatusFilter = 'all' | 1 | 2 | 3;

// 마감일 상태 계산
export function getDeadlineStatus(endAt: Date | null): DeadlineStatus {
  if (!endAt) return 'none';

  const now = new Date();
  const end = new Date(endAt);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  if (diffDays <= 3) return 'soon';
  return 'normal';
}

// 마감일 상태별 스타일
export const deadlineStyles: Record<DeadlineStatus, { badge: string; text: string; bg: string }> = {
  overdue: {
    badge: 'bg-red-500/20 text-red-400 border-red-500/30',
    text: 'text-red-400',
    bg: 'bg-red-500/10',
  },
  today: {
    badge: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    text: 'text-orange-400',
    bg: 'bg-orange-500/10',
  },
  soon: {
    badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    text: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
  },
  normal: {
    badge: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    text: 'text-slate-400',
    bg: '',
  },
  none: {
    badge: 'bg-slate-600/20 text-slate-500 border-slate-600/30',
    text: 'text-slate-500',
    bg: '',
  },
};

// 마감일 상태 라벨
export function getDeadlineLabel(status: DeadlineStatus, endAt: Date | null): string {
  if (status === 'none') return '마감일 없음';
  if (status === 'overdue') {
    const days = getDaysFromNow(endAt!);
    return `${Math.abs(days)}일 지남`;
  }
  if (status === 'today') return '오늘 마감';
  if (status === 'soon') {
    const days = getDaysFromNow(endAt!);
    return `D-${days}`;
  }
  return '';
}

// 오늘로부터의 일수 계산
function getDaysFromNow(date: Date): number {
  const now = new Date();
  const target = new Date(date);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// 태스크 통계 계산
export interface TaskStats {
  total: number;
  completed: number;
  inProgress: number;
  todo: number;
  completionRate: number;
  overdue: number;
  dueToday: number;
  dueSoon: number;
}

export function calculateTaskStats(tasks: Task[]): TaskStats {
  const total = tasks.length;
  const completed = tasks.filter(t => t.taskStatus === 3).length;
  const inProgress = tasks.filter(t => t.taskStatus === 2).length;
  const todo = tasks.filter(t => t.taskStatus === 1).length;

  // 완료되지 않은 태스크 중 마감일 관련 통계
  const activeTasks = tasks.filter(t => t.taskStatus !== 3);
  const overdue = activeTasks.filter(t => getDeadlineStatus(t.endAt) === 'overdue').length;
  const dueToday = activeTasks.filter(t => getDeadlineStatus(t.endAt) === 'today').length;
  const dueSoon = activeTasks.filter(t => getDeadlineStatus(t.endAt) === 'soon').length;

  return {
    total,
    completed,
    inProgress,
    todo,
    completionRate: total === 0 ? 0 : Math.round((completed / total) * 100),
    overdue,
    dueToday,
    dueSoon,
  };
}

// 검색 필터
export function filterBySearch(tasks: Task[], searchQuery: string): Task[] {
  if (!searchQuery.trim()) return tasks;
  const query = searchQuery.toLowerCase().trim();
  return tasks.filter(
    task =>
      task.taskName.toLowerCase().includes(query) ||
      (task.taskDescription && task.taskDescription.toLowerCase().includes(query))
  );
}

// 담당자 필터
export function filterByAssignee(tasks: Task[], assigneeId: number | null): Task[] {
  if (assigneeId === null) return tasks;
  return tasks.filter(task => task.crtdBy === assigneeId);
}

// 상태 필터
export function filterByStatus(tasks: Task[], status: StatusFilter): Task[] {
  if (status === 'all') return tasks;
  return tasks.filter(task => task.taskStatus === status);
}

// 기간 필터
export function filterByPeriod(tasks: Task[], period: PeriodFilter): Task[] {
  if (period === 'all') return tasks;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return tasks.filter(task => {
    if (!task.endAt && period !== 'overdue') return false;

    const endDate = task.endAt ? new Date(task.endAt) : null;
    const endDateOnly = endDate
      ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
      : null;

    switch (period) {
      case 'today':
        return endDateOnly && endDateOnly.getTime() === today.getTime();

      case 'thisWeek': {
        const weekEnd = new Date(today);
        weekEnd.setDate(today.getDate() + (7 - today.getDay()));
        return endDateOnly && endDateOnly >= today && endDateOnly <= weekEnd;
      }

      case 'thisMonth': {
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        return endDateOnly && endDateOnly >= today && endDateOnly <= monthEnd;
      }

      case 'overdue':
        return endDateOnly && endDateOnly < today && task.taskStatus !== 3;

      default:
        return true;
    }
  });
}

// 모든 필터 적용
export function applyAllFilters(
  tasks: Task[],
  searchQuery: string,
  assigneeId: number | null,
  period: PeriodFilter,
  status: StatusFilter
): Task[] {
  let filtered = tasks;
  filtered = filterBySearch(filtered, searchQuery);
  filtered = filterByAssignee(filtered, assigneeId);
  filtered = filterByPeriod(filtered, period);
  filtered = filterByStatus(filtered, status);
  return filtered;
}

// 담당자 목록 추출
export function getUniqueAssignees(tasks: Task[]): { id: number; name: string }[] {
  const map = new Map<number, string>();
  tasks.forEach(task => {
    if (!map.has(task.crtdBy)) {
      map.set(task.crtdBy, task.userName || `사용자 ${task.crtdBy}`);
    }
  });
  return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
}
