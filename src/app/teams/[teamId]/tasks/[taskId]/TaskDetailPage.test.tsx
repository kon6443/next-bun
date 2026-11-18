// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { GetTaskDetailResponse, TaskCommentResponse, TaskDetailResponse } from '@/services/teamService';

const getTaskDetail = vi.fn();
const createTaskComment = vi.fn();
const updateTaskComment = vi.fn();
const deleteTaskComment = vi.fn();
// 나머지 export(훅 배럴이 끌고 오는 연동 상태 조회 등)는 실제 모듈 그대로 둔다 — 화면이 부르는 것만 바꾼다
vi.mock('@/services/teamService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/teamService')>()),
  getTaskDetail: (...a: unknown[]) => getTaskDetail(...a),
  createTaskComment: (...a: unknown[]) => createTaskComment(...a),
  updateTaskComment: (...a: unknown[]) => updateTaskComment(...a),
  deleteTaskComment: (...a: unknown[]) => deleteTaskComment(...a),
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

function detail(taskName: string, comments: TaskCommentResponse[] = []): GetTaskDetailResponse {
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
    comments,
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
  createTaskComment.mockReset();
  updateTaskComment.mockReset();
  deleteTaskComment.mockReset();
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

// API JSON처럼 날짜는 문자열로 온다 — 화면 댓글(Date)로 바꿔 붙여야 한다(상세 조회 comments 항목 모양)
function apiComment(overrides: Partial<Record<keyof TaskCommentResponse, unknown>>): TaskCommentResponse {
  return {
    commentId: 10,
    teamId: 1,
    taskId: 2,
    userId: 1,
    userName: '가',
    commentContent: '첫 댓글',
    status: 1,
    mdfdAt: null,
    crtdAt: '2026-11-01T01:00:00.000Z',
    ...overrides,
  } as unknown as TaskCommentResponse;
}

// 작성·수정 응답은 댓글 엔티티 그대로다 — 작성자 이름(userName)이 없고, 작성 응답은 crtdAt이 빠질 수 있다(메인 계약 확인)
function entityComment(overrides: Record<string, unknown>) {
  const { userName: _omit, ...rest } = apiComment(overrides) as unknown as Record<string, unknown>;
  void _omit;
  return rest as unknown as TaskCommentResponse;
}

describe('TaskDetailPage 댓글 작성·수정·삭제', () => {
  it('작성: 응답에 작성자 이름이 없으니 상세를 다시 받아 팀 닉네임으로 보인다', async () => {
    getTaskDetail
      .mockResolvedValueOnce(detail('태스크', [apiComment({})]))
      .mockResolvedValueOnce(detail('태스크', [apiComment({}), apiComment({ commentId: 11, userName: '내닉네임', commentContent: '새 댓글' })]));
    createTaskComment.mockResolvedValueOnce({ code: 'SUCCESS', message: '', data: entityComment({ commentId: 11, commentContent: '새 댓글', crtdAt: undefined }) });
    render(<TaskDetailPage teamId="1" taskId="2" />);
    await screen.findByText('첫 댓글');

    fireEvent.change(screen.getByLabelText('댓글 입력'), { target: { value: '새 댓글' } });
    await act(async () => {
      fireEvent.click(screen.getByTitle('댓글 작성'));
    });

    expect(await screen.findByText('새 댓글')).toBeInTheDocument();
    expect(screen.getByText('내닉네임')).toBeInTheDocument();
    expect(screen.queryByText('사용자 1')).not.toBeInTheDocument();
    expect(createTaskComment).toHaveBeenCalledWith(1, 2, { commentContent: '새 댓글' }, 'token');
    expect(getTaskDetail).toHaveBeenCalledTimes(2);
  });

  it('수정: 응답(이름 없는 엔티티)의 내용·수정 시각만 덮고 작성자 이름은 그대로 — 상세 재조회 없음', async () => {
    getTaskDetail.mockResolvedValueOnce(detail('태스크', [apiComment({ userName: '팀닉' }), apiComment({ commentId: 12, userId: 2, userName: '나', commentContent: '남의 댓글' })]));
    updateTaskComment.mockResolvedValueOnce({ code: 'SUCCESS', message: '', data: entityComment({ commentContent: '고친 댓글', mdfdAt: '2026-11-03T01:00:00.000Z' }) });
    render(<TaskDetailPage teamId="1" taskId="2" />);
    await screen.findByText('첫 댓글');

    // 태스크 수정 버튼도 있으니 내 댓글 안에서 찾는다
    fireEvent.click(within(screen.getByText('첫 댓글').parentElement!).getByTitle('수정'));
    const editor = screen.getByLabelText('댓글 수정');
    fireEvent.change(editor, { target: { value: '고친 댓글' } });
    await act(async () => {
      fireEvent.click(within(editor.parentElement!).getByRole('button', { name: '수정' }));
    });

    expect(await screen.findByText('고친 댓글')).toBeInTheDocument();
    expect(screen.queryByText('첫 댓글')).not.toBeInTheDocument();
    expect(screen.getByText('남의 댓글')).toBeInTheDocument();
    expect(screen.getByText('(수정됨)')).toBeInTheDocument();
    expect(screen.getByText('팀닉')).toBeInTheDocument();
    expect(screen.queryByText('사용자 1')).not.toBeInTheDocument();
    expect(getTaskDetail).toHaveBeenCalledTimes(1);
  });

  it('삭제: 그 댓글을 "삭제된 댓글입니다."로 바꾸고 상세 재조회 없음', async () => {
    getTaskDetail.mockResolvedValueOnce(detail('태스크', [apiComment({})]));
    deleteTaskComment.mockResolvedValueOnce(undefined);
    render(<TaskDetailPage teamId="1" taskId="2" />);
    await screen.findByText('첫 댓글');

    await act(async () => {
      fireEvent.click(within(screen.getByText('첫 댓글').parentElement!).getByTitle('삭제'));
    });

    await waitFor(() => expect(screen.getByText('삭제된 댓글입니다.')).toBeInTheDocument());
    expect(screen.queryByText('첫 댓글')).not.toBeInTheDocument();
    expect(screen.queryByTitle('삭제')).not.toBeInTheDocument();
    expect(getTaskDetail).toHaveBeenCalledTimes(1);
  });

  it('수정 직전에 출발한 재조회(재입장)가 늦게 와도 방금 고친 내용을 덮지 않는다 — 새로 조회해 옛 응답을 버린다 (리뷰 1차)', async () => {
    const stale = deferred<GetTaskDetailResponse>();
    getTaskDetail
      .mockResolvedValueOnce(detail('태스크', [apiComment({})]))
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(detail('태스크', [apiComment({ commentContent: '고친 댓글', mdfdAt: '2026-11-03T01:00:00.000Z' })]));
    updateTaskComment.mockResolvedValueOnce({ code: 'SUCCESS', message: '', data: entityComment({ commentContent: '고친 댓글', mdfdAt: '2026-11-03T01:00:00.000Z' }) });
    const { rerender } = render(<TaskDetailPage teamId="1" taskId="2" />);
    await screen.findByText('첫 댓글');

    // 재입장 조회가 출발한 채로 댓글을 고친다
    socketState.roomJoinCount = 2;
    rerender(<TaskDetailPage teamId="1" taskId="2" />);
    expect(getTaskDetail).toHaveBeenCalledTimes(2);
    fireEvent.click(within(screen.getByText('첫 댓글').parentElement!).getByTitle('수정'));
    const editor = screen.getByLabelText('댓글 수정');
    fireEvent.change(editor, { target: { value: '고친 댓글' } });
    await act(async () => {
      fireEvent.click(within(editor.parentElement!).getByRole('button', { name: '수정' }));
    });
    expect(await screen.findByText('고친 댓글')).toBeInTheDocument();
    expect(getTaskDetail).toHaveBeenCalledTimes(3);

    // 수정 전에 만들어진 옛 응답이 늦게 온다
    await act(async () => {
      stale.resolve(detail('태스크', [apiComment({})]));
    });
    expect(screen.getByText('고친 댓글')).toBeInTheDocument();
    expect(screen.queryByText('첫 댓글')).not.toBeInTheDocument();
  });

  it('진행 중인 조회가 없으면 수정 뒤 다시 받지 않는다', async () => {
    getTaskDetail.mockResolvedValueOnce(detail('태스크', [apiComment({})]));
    updateTaskComment.mockResolvedValueOnce({ code: 'SUCCESS', message: '', data: entityComment({ commentContent: '고친 댓글', mdfdAt: '2026-11-03T01:00:00.000Z' }) });
    render(<TaskDetailPage teamId="1" taskId="2" />);
    await screen.findByText('첫 댓글');
    fireEvent.click(within(screen.getByText('첫 댓글').parentElement!).getByTitle('수정'));
    const editor = screen.getByLabelText('댓글 수정');
    fireEvent.change(editor, { target: { value: '고친 댓글' } });
    await act(async () => {
      fireEvent.click(within(editor.parentElement!).getByRole('button', { name: '수정' }));
    });
    expect(await screen.findByText('고친 댓글')).toBeInTheDocument();
    expect(getTaskDetail).toHaveBeenCalledTimes(1);
  });

  it('수정이 실패해 뜬 오류는 다시 시도해 성공하면 내린다 (리뷰 1차)', async () => {
    getTaskDetail.mockResolvedValueOnce(detail('태스크', [apiComment({})]));
    updateTaskComment
      .mockRejectedValueOnce(new Error('수정 실패 배너'))
      .mockResolvedValueOnce({ code: 'SUCCESS', message: '', data: entityComment({ commentContent: '고친 댓글', mdfdAt: '2026-11-03T01:00:00.000Z' }) });
    render(<TaskDetailPage teamId="1" taskId="2" />);
    await screen.findByText('첫 댓글');

    fireEvent.click(within(screen.getByText('첫 댓글').parentElement!).getByTitle('수정'));
    const editor = screen.getByLabelText('댓글 수정');
    fireEvent.change(editor, { target: { value: '고친 댓글' } });
    await act(async () => {
      fireEvent.click(within(editor.parentElement!).getByRole('button', { name: '수정' }));
    });
    expect(screen.getByText('수정 실패 배너')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(screen.getByLabelText('댓글 수정').parentElement!).getByRole('button', { name: '수정' }));
    });
    expect(await screen.findByText('고친 댓글')).toBeInTheDocument();
    expect(screen.queryByText('수정 실패 배너')).not.toBeInTheDocument();
    expect(getTaskDetail).toHaveBeenCalledTimes(1);
  });

  it('삭제 요청 중에 화면을 떠나면 응답이 와도 상세를 다시 받지 않는다 (리뷰 2차)', async () => {
    getTaskDetail.mockResolvedValueOnce(detail('태스크', [apiComment({})]));
    const pending = deferred<undefined>();
    deleteTaskComment.mockReturnValueOnce(pending.promise);
    const { unmount } = render(<TaskDetailPage teamId="1" taskId="2" />);
    await screen.findByText('첫 댓글');

    fireEvent.click(within(screen.getByText('첫 댓글').parentElement!).getByTitle('삭제'));
    unmount();
    await act(async () => {
      pending.resolve(undefined);
    });
    expect(getTaskDetail).toHaveBeenCalledTimes(1);
  });
});
