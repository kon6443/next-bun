import type { Task } from '../types/task';
import { STATUS_COMPLETED, STATUS_CANCELLED } from '../config/taskStatusConfig';

// 마감일 상태 타입
export type DeadlineStatus = 'overdue' | 'today' | 'soon' | 'normal' | 'none';

// 기간 필터 타입
export type PeriodFilter = 'all' | 'today' | 'thisWeek' | 'thisMonth' | 'overdue';

// 상태 필터 타입
export type StatusFilter = 'all' | 1 | 2 | 3 | 4 | 5;

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

// ==================== 마감일 정보 통합 함수 ====================

export type TaskDeadlineInfo = {
  status: DeadlineStatus;
  label: string;
  showAlert: boolean;
};

/**
 * 태스크의 마감일 관련 정보를 한 번에 가져오기
 * 완료/취소 상태의 태스크는 항상 'normal' 반환
 * 
 * @param task 태스크 객체
 * @returns 마감일 상태, 라벨, 알림 표시 여부
 */
export function getTaskDeadlineInfo(task: Task): TaskDeadlineInfo {
  // 완료 또는 취소 상태인 경우 마감일 경고 표시 안함
  const isTerminal = task.taskStatus === STATUS_COMPLETED || task.taskStatus === STATUS_CANCELLED;
  const status = isTerminal ? 'normal' : getDeadlineStatus(task.endAt);
  const label = getDeadlineLabel(status, task.endAt);
  const showAlert = ['overdue', 'today', 'soon'].includes(status);

  return { status, label, showAlert };
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
  onHold: number;
  cancelled: number;
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
  const onHold = tasks.filter(t => t.taskStatus === 4).length;
  const cancelled = tasks.filter(t => t.taskStatus === 5).length;

  // 완료/취소되지 않은 태스크 중 마감일 관련 통계
  const activeTasks = tasks.filter(t => t.taskStatus !== 3 && t.taskStatus !== 5);
  const overdue = activeTasks.filter(t => getDeadlineStatus(t.endAt) === 'overdue').length;
  const dueToday = activeTasks.filter(t => getDeadlineStatus(t.endAt) === 'today').length;
  const dueSoon = activeTasks.filter(t => getDeadlineStatus(t.endAt) === 'soon').length;

  return {
    total,
    completed,
    inProgress,
    todo,
    onHold,
    cancelled,
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

// ==================== 날짜 포맷팅 유틸리티 ====================
/**
 * 날짜 포맷 함수 사용 가이드:
 * 
 * | 함수명                 | 포맷 예시           | 용도                              |
 * |------------------------|---------------------|-----------------------------------|
 * | formatCompactDateTime  | "1/15 14:30"        | 카드 날짜 표시, 좁은 공간         |
 * | formatShortDate        | "1월 15일"          | 한글 날짜, 중간 공간              |
 * | formatDateWithYear     | "2024년 1월 15일"   | 테이블, 상세 정보                 |
 * | formatFullDateTime     | "2024년 1월 15일 14:30" | 상세 페이지, 전체 정보        |
 * | formatDateKey          | "2024-01-15"        | 내부 키, 비교용 (표시 X)          |
 * | formatDateDisplay      | "1/15"              | 간트 차트 헤더, 최소 공간         |
 */

/**
 * 컴팩트 날짜+시간 포맷 (M/D HH:mm)
 * 카드, 목록 등 좁은 공간에서 날짜와 시간을 함께 표시할 때 사용
 * @param date - 포맷할 날짜
 * @returns "M/D HH:mm" 형식 문자열
 * @example formatCompactDateTime(new Date('2024-01-15T14:30:00')) // "1/15 14:30"
 */
export function formatCompactDateTime(date: Date): string {
  const d = new Date(date);
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${hours}:${minutes}`;
}

/**
 * 짧은 날짜 포맷 (M월 D일)
 * 한글로 자연스러운 날짜 표시가 필요할 때 사용
 * @param date - 포맷할 날짜 (null 가능)
 * @returns "M월 D일" 형식 문자열 또는 null
 * @example formatShortDate(new Date('2024-01-15')) // "1월 15일"
 */
export function formatShortDate(date: Date | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  return d.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * 연도 포함 날짜 포맷 (YYYY년 M월 D일)
 * 테이블, 목록에서 연도를 포함한 정확한 날짜 표시 시 사용
 * @param date - 포맷할 날짜 (null 가능)
 * @returns "YYYY년 M월 D일" 형식 문자열 또는 "-"
 * @example formatDateWithYear(new Date('2024-01-15')) // "2024년 1월 15일"
 */
export function formatDateWithYear(date: Date | null): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * 전체 날짜+시간 포맷 (YYYY년 M월 D일 HH:mm)
 * 상세 페이지 등에서 날짜와 시간을 모두 표시할 때 사용
 * @param date - 포맷할 날짜 (null 가능)
 * @returns "YYYY년 M월 D일 HH:mm" 형식 문자열 또는 null
 * @example formatFullDateTime(new Date('2024-01-15T14:30:00')) // "2024년 1월 15일 14:30"
 */
export function formatFullDateTime(date: Date | null): string | null {
  if (!date) return null;
  return new Date(date).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * ISO 날짜 키 포맷 (YYYY-MM-DD)
 * 내부 비교, Map 키 등에 사용 (UI 표시용 X)
 * @param date - 포맷할 날짜
 * @returns "YYYY-MM-DD" 형식 문자열
 * @example formatDateKey(new Date('2024-01-15')) // "2024-01-15"
 */
export function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * 간단한 날짜 표시 포맷 (M/D)
 * 간트 차트 헤더, 캘린더 등 최소 공간에서 사용
 * @param date - 포맷할 날짜
 * @returns "M/D" 형식 문자열
 * @example formatDateDisplay(new Date('2024-01-15')) // "1/15"
 */
export function formatDateDisplay(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
