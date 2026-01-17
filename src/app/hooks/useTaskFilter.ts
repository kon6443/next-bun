'use client';

import { useState, useMemo, useCallback } from 'react';
import type { Task } from '../types/task';
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
}

export interface UseTaskFilterReturn {
  // 필터 상태
  filters: TaskFilterState;
  setSearchQuery: (query: string) => void;
  setAssigneeId: (id: number | null) => void;
  setPeriod: (period: PeriodFilter) => void;
  setStatus: (status: StatusFilter) => void;
  resetFilters: () => void;

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
};

export function useTaskFilter(tasks: Task[]): UseTaskFilterReturn {
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

  const resetFilters = useCallback(() => {
    setFilters(initialFilters);
  }, []);

  // 필터된 태스크
  const filteredTasks = useMemo(() => {
    return applyAllFilters(tasks, filters.searchQuery, filters.assigneeId, filters.period, filters.status);
  }, [tasks, filters]);

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
      filters.status !== 'all'
    );
  }, [filters]);

  return {
    filters,
    setSearchQuery,
    setAssigneeId,
    setPeriod,
    setStatus,
    resetFilters,
    filteredTasks,
    stats,
    filteredStats,
    assignees,
    hasActiveFilters,
  };
}
