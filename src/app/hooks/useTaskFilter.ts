'use client';

import { useState, useMemo, useCallback, useDeferredValue } from 'react';
import type { Task, TeamTag } from '../types/task';
import {
  applyAllFilters,
  calculateTaskStats,
  getUniqueAssignees,
  type PeriodFilter,
  type StatusFilter,
  type TaskStats,
} from '../utils/taskUtils';

export interface TaskFilterState {
  searchQuery: string;
  assigneeId: number | null;
  period: PeriodFilter;
  status: StatusFilter;
  /** 태그 필터 (OR — 하나라도 붙은 태스크). 비어 있으면 전부 */
  tagIds: number[];
}

export interface UseTaskFilterReturn {
  // 필터 상태
  filters: TaskFilterState;
  setSearchQuery: (query: string) => void;
  setAssigneeId: (id: number | null) => void;
  setPeriod: (period: PeriodFilter) => void;
  setStatus: (status: StatusFilter) => void;
  setTagIds: (tagIds: number[]) => void;
  resetFilters: () => void;
  /** 저장해 둔 필터 전체를 한 번에 적용 (보드 상태 복원용) */
  restoreFilters: (filters: TaskFilterState) => void;

  // 필터된 결과
  filteredTasks: Task[];

  // 통계
  stats: TaskStats;
  filteredStats: TaskStats;

  // 담당자 목록
  assignees: { id: number; name: string }[];

  // 필터 적용 여부
  hasActiveFilters: boolean;
}

const initialFilters: TaskFilterState = {
  searchQuery: '',
  assigneeId: null,
  period: 'all',
  status: 'all',
  tagIds: [],
};

/**
 * @param teamTags 팀 태그 — 검색이 칩에 보이는 태그 이름으로 찾게 한다 (없으면 태스크 응답의 이름)
 */
export function useTaskFilter(tasks: Task[], teamTags: readonly TeamTag[] | null = null): UseTaskFilterReturn {
  const [filters, setFilters] = useState<TaskFilterState>(initialFilters);

  // 필터 설정 함수들
  const setSearchQuery = useCallback((query: string) => {
    setFilters(prev => ({ ...prev, searchQuery: query }));
  }, []);

  const setAssigneeId = useCallback((id: number | null) => {
    setFilters(prev => ({ ...prev, assigneeId: id }));
  }, []);

  const setPeriod = useCallback((period: PeriodFilter) => {
    setFilters(prev => ({ ...prev, period }));
  }, []);

  const setStatus = useCallback((status: StatusFilter) => {
    setFilters(prev => ({ ...prev, status }));
  }, []);

  const setTagIds = useCallback((tagIds: number[]) => {
    setFilters(prev => ({ ...prev, tagIds }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(initialFilters);
  }, []);

  const restoreFilters = useCallback((saved: TaskFilterState) => {
    setFilters(saved);
  }, []);

  // 검색어는 지연값으로 거른다 — 입력칸(filters.searchQuery)은 키마다 바로 바뀌고, 무거운 필터·보드 다시 그리기는
  // 타이핑이 잠깐 멈출 때 낮은 우선순위로(저사양 모바일 타이핑 지연 방지). 다른 필터는 즉시 반영
  const deferredSearchQuery = useDeferredValue(filters.searchQuery);

  // 필터된 태스크
  const filteredTasks = useMemo(() => {
    return applyAllFilters(tasks, deferredSearchQuery, filters.assigneeId, filters.period, filters.status, filters.tagIds, teamTags);
  }, [tasks, deferredSearchQuery, filters.assigneeId, filters.period, filters.status, filters.tagIds, teamTags]);

  // 전체 통계
  const stats = useMemo(() => calculateTaskStats(tasks), [tasks]);

  // 필터된 통계
  const filteredStats = useMemo(() => calculateTaskStats(filteredTasks), [filteredTasks]);

  // 담당자 목록
  const assignees = useMemo(() => getUniqueAssignees(tasks), [tasks]);

  // 필터 적용 여부
  const hasActiveFilters = useMemo(() => {
    return (
      filters.searchQuery !== '' ||
      filters.assigneeId !== null ||
      filters.period !== 'all' ||
      filters.status !== 'all' ||
      filters.tagIds.length > 0
    );
  }, [filters]);

  return {
    filters,
    setSearchQuery,
    setAssigneeId,
    setPeriod,
    setStatus,
    setTagIds,
    resetFilters,
    restoreFilters,
    filteredTasks,
    stats,
    filteredStats,
    assignees,
    hasActiveFilters,
  };
}
