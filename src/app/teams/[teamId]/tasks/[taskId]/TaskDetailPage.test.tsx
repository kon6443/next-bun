// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { GetTaskDetailResponse, TaskDetailResponse } from '@/services/teamService';

const getTaskDetail = vi.fn();
vi.mock('@/services/teamService', () => ({
  getTaskDetail: (...a: unknown[]) => getTaskDetail(...a),
  createTaskComment: vi.fn(),
  updateTaskComment: vi.fn(),
  deleteTaskComment: vi.fn(),
  updateTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  updateTaskActiveStatus: vi.fn(),
}));
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { accessToken: 'token', userId: 1 } }, status: 'authenticated' }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));
// 재입장 횟수만 바꿔 가며 조용한 재조회를 일으킨다 — 소켓은 없다
const socketState = { socket: null, roomJoinCount: 1 };
vi.mock('../../contexts', () => ({
  useTeamSocketContext: () => socketState,
}));

import TaskDetailPage from './TaskDetailPage';

function detail(taskName: string): GetTaskDetailResponse {
  const data: TaskDetailResponse = {
    taskId: 2,
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
    comments: [],
  };
  return { code: 'SUCCESS', message: 'ok', data };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  cleanup();
  getTaskDetail.mockReset();
  socketState.roomJoinCount = 1;
});

describe('TaskDetailPage 상세 조회 순번', () => {
  it('먼저 시작한 조회의 응답이 늦게 와도 나중 조회의 결과를 덮지 않는다 — 로딩도 남지 않는다', async () => {
    const first = deferred<GetTaskDetailResponse>();
    const second = deferred<GetTaskDetailResponse>();
    getTaskDetail.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { rerender } = render(<TaskDetailPage teamId="1" taskId="2" />);
    expect(getTaskDetail).toHaveBeenCalledTimes(1);

    // 첫 조회가 끝나기 전에 방에 다시 들어와 조용한 재조회가 나간다
    socketState.roomJoinCount = 2;
    rerender(<TaskDetailPage teamId="1" taskId="2" />);
    expect(getTaskDetail).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve(detail('새 이름'));
    });
    expect(screen.getByRole('heading', { name: '새 이름' })).toBeInTheDocument();

    await act(async () => {
      first.resolve(detail('옛 이름'));
    });
    expect(screen.getByRole('heading', { name: '새 이름' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '옛 이름' })).not.toBeInTheDocument();
  });

  it('먼저 시작한 조회가 늦게 실패해도 나중 조회의 결과 위에 오류를 띄우지 않는다', async () => {
    const first = deferred<GetTaskDetailResponse>();
    const second = deferred<GetTaskDetailResponse>();
    getTaskDetail.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { rerender } = render(<TaskDetailPage teamId="1" taskId="2" />);
    socketState.roomJoinCount = 2;
    rerender(<TaskDetailPage teamId="1" taskId="2" />);

    await act(async () => {
      second.resolve(detail('새 이름'));
    });
    await act(async () => {
      first.reject(new Error('옛 조회 실패'));
    });
    expect(screen.getByRole('heading', { name: '새 이름' })).toBeInTheDocument();
    expect(screen.queryByText('옛 조회 실패')).not.toBeInTheDocument();
  });
});
