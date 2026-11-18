// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { Task } from '../types/task';

// App Router의 useRouter는 렌더마다 같은 인스턴스다
const router = { push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
// jsdom에는 ResizeObserver가 없다 — 칸반이 컬럼 폭 측정에 쓴다
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

// 카드·행이 실제로 다시 그려졌는지는 그릴 때마다 부르는 마감 계산 횟수로 센다
// (TaskCard는 getDeadlineStatus, 목록 행은 getTaskDeadlineInfo를 카드·행마다 1번 부른다)
const calls = { card: 0, row: 0 };
vi.mock('../utils/taskUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/taskUtils')>();
  return {
    ...actual,
    getDeadlineStatus: (...a: Parameters<typeof actual.getDeadlineStatus>) => {
      calls.card++;
      return actual.getDeadlineStatus(...a);
    },
    getTaskDeadlineInfo: (...a: Parameters<typeof actual.getTaskDeadlineInfo>) => {
      calls.row++;
      return actual.getTaskDeadlineInfo(...a);
    },
  };
});

import { Kanban } from './Kanban';
import { ListView } from './ListView';

const task = (taskId: number, overrides: Partial<Task> = {}): Task => ({
  taskId,
  teamId: 1,
  taskName: `카드${taskId}`,
  taskDescription: null,
  taskStatus: 1,
  actStatus: 1,
  startAt: null,
  endAt: new Date('2026-12-01T00:00:00Z'),
  completedAt: null,
  crtdAt: new Date('2026-11-01T00:00:00Z'),
  crtdBy: 1,
  userName: '가',
  tags: [],
  ...overrides,
});

// TeamBoard처럼 콜백은 렌더마다 같은 참조
const onStatusChange = async () => {};
const onTagClick = () => {};

afterEach(() => {
  cleanup();
  calls.card = calls.row = 0;
});

describe('보드 카드·행 memo — 보드가 다시 그려져도 바뀌지 않은 카드·행은 건너뛴다', () => {
  it('칸반: 같은 카드로 다시 그리면 카드 0개, 카드 1개만 바뀌면 그 카드만 다시 그린다', () => {
    const tasks = [task(1), task(2), task(3), task(4), task(5)];
    const columns = (list: Task[]) => ({ todo: list, inProgress: [], done: [], onHold: [], cancelled: [] });
    // 보드가 다시 그려질 때처럼 emptyAction 같은 다른 prop은 매번 새 값이다
    const { rerender } = render(<Kanban tasksByColumn={columns(tasks)} onStatusChange={onStatusChange} teamId="1" onTagClick={onTagClick} emptyAction={<span />} />);
    expect(calls.card).toBe(5);

    calls.card = 0;
    rerender(<Kanban tasksByColumn={columns(tasks)} onStatusChange={onStatusChange} teamId="1" onTagClick={onTagClick} emptyAction={<span />} />);
    expect(calls.card).toBe(0);

    const changed = [tasks[0], task(2, { taskName: '바뀐 카드' }), ...tasks.slice(2)];
    rerender(<Kanban tasksByColumn={columns(changed)} onStatusChange={onStatusChange} teamId="1" onTagClick={onTagClick} emptyAction={<span />} />);
    expect(calls.card).toBe(1);
  });

  it('목록: 같은 행으로 다시 그리면 행 0개, 행 1개만 바뀌면 그 행만 다시 그린다', () => {
    const tasks = [task(1), task(2), task(3), task(4), task(5)];
    const { rerender } = render(<ListView tasks={tasks} teamId="1" onTagClick={onTagClick} emptyAction={<span />} />);
    expect(calls.row).toBe(5);

    calls.row = 0;
    rerender(<ListView tasks={[...tasks]} teamId="1" onTagClick={onTagClick} emptyAction={<span />} />);
    expect(calls.row).toBe(0);

    rerender(<ListView tasks={[tasks[0], task(2, { taskName: '바뀐 행' }), ...tasks.slice(2)]} teamId="1" onTagClick={onTagClick} emptyAction={<span />} />);
    expect(calls.row).toBe(1);
  });
});
