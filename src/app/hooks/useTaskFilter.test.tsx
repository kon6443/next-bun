// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Task } from '../types/task';
import { useTaskFilter } from './useTaskFilter';

const task = (taskId: number, taskName: string): Task => ({
  taskId,
  teamId: 1,
  taskName,
  taskDescription: null,
  taskStatus: 1,
  actStatus: 1,
  startAt: null,
  endAt: null,
  completedAt: null,
  crtdAt: new Date('2026-11-01T00:00:00Z'),
  crtdBy: 1,
  userName: '가',
  tags: [],
});

const tasks = [task(1, '디자인 시안'), task(2, '배포 점검'), task(3, '디자인 리뷰')];

describe('useTaskFilter 검색 — 입력값은 즉시, 걸러진 목록은 지연값(useDeferredValue)으로', () => {
  it('검색어를 넣으면 입력값(filters.searchQuery)은 바로 바뀌고, 걸러진 목록·활성 필터 표시도 반영된다', () => {
    const { result } = renderHook(() => useTaskFilter(tasks));
    act(() => result.current.setSearchQuery('디자인'));
    expect(result.current.filters.searchQuery).toBe('디자인');
    expect(result.current.hasActiveFilters).toBe(true);
    expect(result.current.filteredTasks.map(t => t.taskId)).toEqual([1, 3]);

    act(() => result.current.resetFilters());
    expect(result.current.filters.searchQuery).toBe('');
    expect(result.current.filteredTasks).toHaveLength(3);
  });

  it('보드 상태 복원(restoreFilters)으로 넣은 검색어도 걸러진 목록에 반영된다', () => {
    const { result } = renderHook(() => useTaskFilter(tasks));
    act(() =>
      result.current.restoreFilters({ ...result.current.filters, searchQuery: '배포' }),
    );
    expect(result.current.filters.searchQuery).toBe('배포');
    expect(result.current.filteredTasks.map(t => t.taskId)).toEqual([2]);
  });
});
