// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { TaskFilters } from './TaskFilters';

const teamTags = [
  { tagId: 1, tagName: '버그', tagColor: '#F87171', sortOrder: 1, taskCount: 2 },
  { tagId: 2, tagName: '디자인', tagColor: '#38BDF8', sortOrder: 2, taskCount: 1 },
  { tagId: 3, tagName: '기타', tagColor: '#34D399', sortOrder: 3, taskCount: 0 },
];

function renderFilters(overrides: Partial<ComponentProps<typeof TaskFilters>> = {}) {
  const props: ComponentProps<typeof TaskFilters> = {
    searchQuery: '',
    onSearchChange: () => {},
    assigneeId: null,
    onAssigneeChange: () => {},
    assignees: [],
    period: 'all',
    onPeriodChange: () => {},
    status: 'all',
    onStatusChange: () => {},
    tags: teamTags,
    tagIds: [],
    onTagIdsChange: () => {},
    taskCounts: { total: 0, todo: 0, inProgress: 0, done: 0, onHold: 0, cancelled: 0 },
    hasActiveFilters: false,
    onResetFilters: () => {},
    ...overrides,
  };
  return render(<TaskFilters {...props} />);
}

afterEach(cleanup);

describe('TaskFilters — 접힌 상태의 태그 필터', () => {
  it('패널을 접어도 거르는 중인 태그가 팀 순서대로 보이고, 하나씩 해제할 수 있다', () => {
    const onTagIdsChange = vi.fn();
    renderFilters({ tagIds: [3, 1], hasActiveFilters: true, onTagIdsChange });

    const chips = screen.getAllByRole('button', { name: /태그 필터 해제/ });
    expect(chips.map(chip => chip.textContent)).toEqual(['버그', '기타']);

    fireEvent.click(screen.getByRole('button', { name: '기타 태그 필터 해제' }));
    expect(onTagIdsChange).toHaveBeenCalledWith([1]);
  });

  it('고른 태그가 없으면 접힌 영역에 태그 칩을 그리지 않는다', () => {
    renderFilters();
    expect(screen.queryByRole('list', { name: '선택한 태그 필터' })).toBeNull();
  });

  it('패널을 펼치면 접힌 칩 대신 전체 태그 토글이 보인다', () => {
    renderFilters({ tagIds: [1], hasActiveFilters: true });
    fireEvent.click(screen.getByRole('button', { name: '필터 열기/닫기' }));
    expect(screen.queryByRole('list', { name: '선택한 태그 필터' })).toBeNull();
    expect(screen.getByRole('button', { name: '버그', pressed: true })).toBeInTheDocument();
  });
});
