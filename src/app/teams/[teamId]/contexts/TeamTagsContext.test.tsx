// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, act, waitFor, cleanup, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { TeamTag } from '@/app/types/task';
import { ApiError } from '@/types/api';

// 하드 로드 직후처럼 세션이 늦게 생기는 경우를 흉내 내려고 토큰을 바꿀 수 있게 둔다
let sessionToken: string | undefined = 'tok';
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: sessionToken ? { user: { accessToken: sessionToken, userId: 7 } } : null }),
}));

// 소켓은 on으로 등록된 핸들러를 모아 두고 테스트가 직접 호출한다
const socketHandlers = new Map<string, (payload: unknown) => void>();
const fakeSocket = {
  on: (event: string, handler: (payload: unknown) => void) => void socketHandlers.set(event, handler),
  off: (event: string) => void socketHandlers.delete(event),
};
const emit = (event: string, payload: unknown) => act(() => socketHandlers.get(event)?.(payload));
vi.mock('./TeamSocketContext', () => ({
  useTeamSocketContext: () => ({ socket: fakeSocket, roomJoinCount: 0 }),
}));

const getTeamTags = vi.fn();
const reorderTeamTags = vi.fn();
const createTeamTag = vi.fn();
vi.mock('@/services/teamService', () => ({
  getTeamTags: (...args: unknown[]) => getTeamTags(...args),
  reorderTeamTags: (...args: unknown[]) => reorderTeamTags(...args),
  createTeamTag: (...args: unknown[]) => createTeamTag(...args),
  updateTeamTag: vi.fn(),
  deleteTeamTag: vi.fn(),
}));

import { TeamTagsProvider, useTeamTagsContext } from './TeamTagsContext';
import { TaskTagField } from '../components/TaskTagField';
import { TagModal } from '../components/TagModal';

const teamTag = (tagId: number, sortOrder = tagId, tagName = `태그${tagId}`): TeamTag => ({
  tagId,
  tagName,
  tagColor: '#38BDF8',
  sortOrder,
  taskCount: 0,
});
const listResponse = (tags: TeamTag[]) => ({ code: 'SUCCESS', message: 'ok', data: tags });
const ids = (tags: TeamTag[] | null) => tags?.map(t => t.tagId);

/** GET 응답을 테스트가 원하는 순서로 돌려준다 — pending[n]은 n번째 GET */
let pending: Array<(tags: TeamTag[]) => void>;
const deferGets = () =>
  getTeamTags.mockImplementation(() => new Promise(resolve => pending.push(tags => resolve(listResponse(tags)))));
const respond = (index: number, tags: TeamTag[]) => act(async () => pending[index](tags));

/** 컨텍스트를 테스트에서 직접 부르기 위한 창 */
let ctx: ReturnType<typeof useTeamTagsContext>;
function Probe() {
  ctx = useTeamTagsContext();
  return null;
}

const wrapper = ({ children }: { children: ReactNode }) => <TeamTagsProvider teamId={1}>{children}</TeamTagsProvider>;

function FieldHarness({ showField, value, onChange }: { showField: boolean; value: number[]; onChange: (ids: number[]) => void }) {
  return (
    <TeamTagsProvider teamId={1}>
      <Probe />
      {showField && <TaskTagField value={value} onChange={onChange} />}
    </TeamTagsProvider>
  );
}

beforeEach(() => {
  sessionToken = 'tok';
  pending = [];
  socketHandlers.clear();
  getTeamTags.mockReset();
  reorderTeamTags.mockReset();
  createTeamTag.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(cleanup);

describe('TeamTagsContext — 반영', () => {
  it('순서 변경이 실패하면(409) 이전 순서로 되돌리고 서버 목록을 다시 받는다', async () => {
    getTeamTags.mockResolvedValue(listResponse([teamTag(1), teamTag(2), teamTag(3)]));
    reorderTeamTags.mockRejectedValue(new ApiError('TEAM_TAG_ORDER_CONFLICT', '순서 충돌', 409));
    const { result } = renderHook(() => useTeamTagsContext(), { wrapper });
    await waitFor(() => expect(result.current.tags).toHaveLength(3));
    expect(getTeamTags).toHaveBeenCalledTimes(1);

    await act(async () => {
      await expect(result.current.reorderTags([3, 1, 2])).rejects.toMatchObject({ status: 409 });
    });

    expect(ids(result.current.tags)).toEqual([1, 2, 3]);
    await waitFor(() => expect(getTeamTags).toHaveBeenCalledTimes(2));
  });

  it('본인이 만든 태그의 tagCreated도 목록에 넣고(다른 탭 대비), 같은 이벤트가 다시 와도 중복되지 않는다', async () => {
    getTeamTags.mockResolvedValue(listResponse([teamTag(1)]));
    const { result } = renderHook(() => useTeamTagsContext(), { wrapper });
    await waitFor(() => expect(result.current.tags).toHaveLength(1));

    const payload = { teamId: 1, tagId: 2, tagName: '다른 탭', tagColor: '#F87171', sortOrder: 2, createdBy: 7 };
    emit('tagCreated', payload);
    emit('tagCreated', payload);

    expect(ids(result.current.tags)).toEqual([1, 2]);
  });
});

describe('TeamTagsContext — 늦게 도착한 읽기 응답', () => {
  it.each([
    {
      name: 'tagCreated',
      event: { teamId: 1, tagId: 3, tagName: '새 태그', tagColor: '#F87171', sortOrder: 3, createdBy: 99 },
      check: (tags: TeamTag[]) => expect(ids(tags)).toEqual([1, 2, 3]),
    },
    {
      name: 'tagDeleted',
      event: { teamId: 1, tagId: 2, deletedBy: 99 },
      check: (tags: TeamTag[]) => expect(ids(tags)).toEqual([1]),
    },
    {
      name: 'tagUpdated',
      event: { teamId: 1, tagId: 1, tagName: '바뀐 이름', tagColor: '#A78BFA', sortOrder: 1, updatedBy: 99 },
      check: (tags: TeamTag[]) => expect(tags[0]).toMatchObject({ tagName: '바뀐 이름', tagColor: '#A78BFA' }),
    },
  ])('조회 중 받은 $name은 그보다 먼저 읽힌 GET 응답이 와도 유지되고, 다시 읽어 수렴한다', async ({ name, event, check }) => {
    deferGets();
    render(<FieldHarness showField={false} value={[]} onChange={() => {}} />);
    await respond(0, [teamTag(1), teamTag(2)]);

    let refreshed: Promise<boolean> = Promise.resolve(false);
    act(() => {
      refreshed = ctx.refresh();
    });
    emit(name, event);
    await respond(1, [teamTag(1), teamTag(2)]); // 이벤트 전에 읽힌 응답

    check(ctx.tags!);
    expect(ctx.isLoading).toBe(true);
    expect(pending).toHaveLength(3); // 다시 읽는 중

    await respond(2, ctx.tags!); // 서버도 이벤트를 반영한 목록
    await expect(refreshed).resolves.toBe(true);
    check(ctx.tags!);
    expect(ctx.isLoading).toBe(false);
  });

  it('동시에 부른 refresh는 GET 하나를 함께 기다리고 같은 결과를 받는다', async () => {
    deferGets();
    render(<FieldHarness showField={false} value={[]} onChange={() => {}} />);
    await respond(0, [teamTag(1)]);

    let first: Promise<boolean> = Promise.resolve(false);
    let second: Promise<boolean> = Promise.resolve(false);
    act(() => {
      first = ctx.refresh();
      second = ctx.refresh();
    });
    expect(second).toBe(first);
    expect(getTeamTags).toHaveBeenCalledTimes(2);

    await respond(1, [teamTag(1), teamTag(2)]);
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it('순서 변경 PUT 중 다른 사용자가 만든 태그는, 그 태그가 없는 늦은 PUT 응답이 와도 남는다', async () => {
    getTeamTags.mockResolvedValue(listResponse([teamTag(1), teamTag(2), teamTag(3)]));
    let finishReorder: (tags: TeamTag[]) => void = () => {};
    reorderTeamTags.mockImplementation(() => new Promise(resolve => (finishReorder = tags => resolve(listResponse(tags)))));
    const { result } = renderHook(() => useTeamTagsContext(), { wrapper });
    await waitFor(() => expect(result.current.tags).toHaveLength(3));

    let reorder: Promise<void> = Promise.resolve();
    act(() => {
      reorder = result.current.reorderTags([2, 1, 3]);
    });
    emit('tagCreated', { teamId: 1, tagId: 4, tagName: '새 태그', tagColor: '#F87171', sortOrder: 4, createdBy: 99 });
    await act(async () => {
      finishReorder([teamTag(2, 1), teamTag(1, 2), teamTag(3, 3)]);
      await reorder;
    });

    expect(ids(result.current.tags)).toEqual([2, 1, 3, 4]);
  });

  it('같은 탭의 tagsReordered가 PUT 응답보다 먼저 와도 순서는 그대로다', async () => {
    getTeamTags.mockResolvedValue(listResponse([teamTag(1), teamTag(2), teamTag(3)]));
    let finishReorder: (tags: TeamTag[]) => void = () => {};
    reorderTeamTags.mockImplementation(() => new Promise(resolve => (finishReorder = tags => resolve(listResponse(tags)))));
    const { result } = renderHook(() => useTeamTagsContext(), { wrapper });
    await waitFor(() => expect(result.current.tags).toHaveLength(3));

    let reorder: Promise<void> = Promise.resolve();
    act(() => {
      reorder = result.current.reorderTags([3, 1, 2]);
    });
    emit('tagsReordered', { teamId: 1, tagIds: [3, 1, 2], updatedBy: 7 });
    await act(async () => {
      finishReorder([teamTag(3, 1), teamTag(1, 2), teamTag(2, 3)]);
      await reorder;
    });

    expect(ids(result.current.tags)).toEqual([3, 1, 2]);
  });
});

describe('TeamTagsContext — 순서 변경·실패·언마운트', () => {
  let finishReorder: (tags: TeamTag[]) => void;
  const deferReorder = () =>
    reorderTeamTags.mockImplementation(() => new Promise(resolve => (finishReorder = tags => resolve(listResponse(tags)))));

  it('순서 저장을 기다리는 동안 반영되는 조회가 커밋 전 옛 순서여도 바꾼 순서를 유지한다', async () => {
    deferGets();
    deferReorder();
    render(<FieldHarness showField={false} value={[]} onChange={() => {}} />);
    await respond(0, [teamTag(1), teamTag(2), teamTag(3)]);

    let reorder: Promise<void> = Promise.resolve();
    act(() => {
      reorder = ctx.reorderTags([3, 1, 2]);
    });
    act(() => {
      ctx.refresh(); // 모달 열기·다시 시도·재연결 등
    });
    await respond(1, [teamTag(1), teamTag(2), teamTag(3)]); // PUT 커밋 전에 읽힌 옛 순서
    expect(ids(ctx.tags)).toEqual([3, 1, 2]);

    await act(async () => {
      finishReorder([teamTag(3, 1), teamTag(1, 2), teamTag(2, 3)]);
      await reorder;
    });
    expect(ids(ctx.tags)).toEqual([3, 1, 2]);
  });

  it('순서 저장 응답이 낙관 반영과 다르면(서버가 그사이 생긴 태그 포함) 응답으로 맞춘다', async () => {
    getTeamTags.mockResolvedValue(listResponse([teamTag(1), teamTag(2), teamTag(3)]));
    deferReorder();
    const { result } = renderHook(() => useTeamTagsContext(), { wrapper });
    await waitFor(() => expect(result.current.tags).toHaveLength(3));

    let reorder: Promise<void> = Promise.resolve();
    act(() => {
      reorder = result.current.reorderTags([3, 1, 2]);
    });
    await act(async () => {
      finishReorder([teamTag(3, 1), teamTag(1, 2), teamTag(2, 3), teamTag(4, 4)]);
      await reorder;
    });
    expect(ids(result.current.tags)).toEqual([3, 1, 2, 4]);
  });

  it('조회 중 받은 tagsReordered는 그보다 먼저 읽힌 GET을 무효로 만든다', async () => {
    deferGets();
    render(<FieldHarness showField={false} value={[]} onChange={() => {}} />);
    await respond(0, [teamTag(1), teamTag(2)]);

    let refreshed: Promise<boolean> = Promise.resolve(false);
    act(() => {
      refreshed = ctx.refresh();
    });
    emit('tagsReordered', { teamId: 1, tagIds: [2, 1], updatedBy: 99 });
    await respond(1, [teamTag(1), teamTag(2)]);
    expect(ids(ctx.tags)).toEqual([2, 1]);
    expect(pending).toHaveLength(3);

    await respond(2, [teamTag(2, 1), teamTag(1, 2)]);
    await expect(refreshed).resolves.toBe(true);
    expect(ids(ctx.tags)).toEqual([2, 1]);
  });

  it('조회가 실패하면 false를 돌려주고 로딩을 끝낸다', async () => {
    getTeamTags.mockResolvedValueOnce(listResponse([teamTag(1)]));
    const { result } = renderHook(() => useTeamTagsContext(), { wrapper });
    await waitFor(() => expect(result.current.tags).toHaveLength(1));

    getTeamTags.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    let refreshed = true;
    await act(async () => {
      refreshed = await result.current.refresh();
    });
    expect(refreshed).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(ids(result.current.tags)).toEqual([1]);
  });

  it('언마운트된 뒤 도착한 조회 응답은 반영하지 않고 false로 끝난다', async () => {
    deferGets();
    const { unmount } = render(<FieldHarness showField={false} value={[]} onChange={() => {}} />);
    const refreshed = ctx.refresh(); // 마운트 조회에 합류
    unmount();
    await act(async () => pending[0]([teamTag(1)]));
    await expect(refreshed).resolves.toBe(false);
    expect(getTeamTags).toHaveBeenCalledTimes(1);
  });
});

describe('TaskTagField — 고른 태그 정리', () => {
  it('세션이 늦게 생겨도(하드 로드) 토큰이 생기면 새로 읽고, 이후 삭제 이벤트로 고른 태그를 정리한다', async () => {
    sessionToken = undefined;
    deferGets();
    const onChange = vi.fn();
    const { rerender } = render(<FieldHarness showField value={[1, 5]} onChange={onChange} />);
    expect(getTeamTags).not.toHaveBeenCalled();

    sessionToken = 'tok';
    rerender(<FieldHarness showField value={[1, 5]} onChange={onChange} />);
    expect(pending).toHaveLength(1); // 폼과 Provider가 같은 조회를 기다린다
    await respond(0, [teamTag(1), teamTag(5)]);
    expect(onChange).not.toHaveBeenCalled();

    emit('tagDeleted', { teamId: 1, tagId: 5, deletedBy: 99 });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([1]));
  });

  it('폼을 연 뒤 서버 목록을 새로 받기 전에는 고른 태그를 지우지 않고, 받은 뒤 실제로 없는 태그만 뺀다', async () => {
    deferGets();
    const onChange = vi.fn();

    // 보드에서 받아 둔 오래된 목록 — 다른 탭에서 만든 태그 9를 모른다
    const { rerender } = render(<FieldHarness showField={false} value={[1, 9, 5]} onChange={onChange} />);
    await respond(0, [teamTag(1)]);

    // 수정 폼 진입 — 새로 받는 중에는 오래된 목록으로 지우지 않는다
    rerender(<FieldHarness showField value={[1, 9, 5]} onChange={onChange} />);
    expect(pending).toHaveLength(2);
    expect(onChange).not.toHaveBeenCalled();

    // 서버에는 9가 있고 5는 삭제됐다
    await respond(1, [teamTag(1), teamTag(9)]);
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith([1, 9]);
  });

  it('폼 진입 조회 중 태그를 만들어 조회가 무효가 돼도, 다시 읽어 반영될 때까지 오래된 목록으로 지우지 않는다', async () => {
    deferGets();
    createTeamTag.mockResolvedValue({ code: 'SUCCESS', message: 'ok', data: teamTag(2) });
    const onChange = vi.fn();

    const { rerender } = render(<FieldHarness showField={false} value={[9]} onChange={onChange} />);
    await respond(0, [teamTag(1)]); // 9를 모르는 진입 목록
    rerender(<FieldHarness showField value={[9]} onChange={onChange} />);

    await act(async () => {
      await ctx.createTag('태그2', '#38BDF8');
    });
    await respond(1, [teamTag(1)]); // 생성 전에 읽힌 응답 → 무효, 다시 읽는다

    expect(onChange).not.toHaveBeenCalled();
    expect(ctx.isLoading).toBe(true);
    expect(ids(ctx.tags)).toEqual([1, 2]);

    await respond(2, [teamTag(1), teamTag(2), teamTag(9)]);
    expect(ids(ctx.tags)).toEqual([1, 2, 9]);
    expect(ctx.isLoading).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('폼을 열기 전에 시작된 조회(X 생성 전)가 X의 tagCreated보다 먼저 와도, 폼은 새로 읽은 결과를 받기 전에 X를 지우지 않는다', async () => {
    deferGets();
    const onChange = vi.fn();
    // 보드 진입 조회가 아직 진행 중일 때 수정 폼이 열린다 (상세 응답에는 다른 탭에서 붙인 X=9가 있다)
    const { rerender } = render(<FieldHarness showField={false} value={[9]} onChange={onChange} />);
    rerender(<FieldHarness showField value={[9]} onChange={onChange} />);
    expect(pending).toHaveLength(1); // 폼은 진행 중 조회에 합류하지 않고 기다린다

    await respond(0, [teamTag(1)]); // X 생성 전 스냅샷 — tagCreated보다 먼저 도착
    expect(ids(ctx.tags)).toEqual([1]);
    expect(pending).toHaveLength(2); // 폼의 새 조회
    expect(onChange).not.toHaveBeenCalled();

    await respond(1, [teamTag(1), teamTag(9)]);
    emit('tagCreated', { teamId: 1, tagId: 9, tagName: '태그9', tagColor: '#38BDF8', sortOrder: 9, createdBy: 7 });
    expect(ids(ctx.tags)).toEqual([1, 9]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('읽을 때마다 무효가 되면 3번까지만 읽고 포기한다 — 그 뒤에는 고른 태그를 지우지 않는다', async () => {
    deferGets();
    const onChange = vi.fn();
    const { rerender } = render(<FieldHarness showField={false} value={[1, 9]} onChange={onChange} />);
    await respond(0, [teamTag(1)]);
    rerender(<FieldHarness showField value={[1, 9]} onChange={onChange} />);

    let joined: Promise<boolean> = Promise.resolve(true);
    act(() => {
      joined = ctx.refresh(); // 폼의 조회에 합류
    });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      emit('tagUpdated', { teamId: 1, tagId: 1, tagName: `이름${attempt}`, tagColor: '#38BDF8', sortOrder: 1, updatedBy: 99 });
      await respond(attempt, [teamTag(1)]);
    }

    await expect(joined).resolves.toBe(false);
    expect(getTeamTags).toHaveBeenCalledTimes(4);
    expect(ctx.isLoading).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('TagModal — 순서 변경 잠금', () => {
  it('순서 변경 요청이 진행 중이면 드래그 핸들을 막아 두 번째 드롭이 나가지 않는다', async () => {
    getTeamTags.mockResolvedValue(listResponse([teamTag(1), teamTag(2), teamTag(3)]));
    let finishReorder: (tags: TeamTag[]) => void = () => {};
    reorderTeamTags.mockImplementation(() => new Promise(resolve => (finishReorder = tags => resolve(listResponse(tags)))));

    render(
      <TeamTagsProvider teamId={1}>
        <Probe />
        <TagModal isOpen onClose={() => {}} mode="manage" />
      </TeamTagsProvider>,
    );
    const handles = () => screen.getAllByRole('button', { name: /순서 바꾸기/ }) as HTMLButtonElement[];
    await waitFor(() => expect(handles()).toHaveLength(3));
    expect(handles().every(b => !b.disabled)).toBe(true);

    let reorder: Promise<void> = Promise.resolve();
    act(() => {
      reorder = ctx.reorderTags([2, 1, 3]);
    });
    expect(handles().every(b => b.disabled && b.getAttribute('aria-disabled') === 'true')).toBe(true);

    await act(async () => {
      finishReorder([teamTag(2, 1), teamTag(1, 2), teamTag(3, 3)]);
      await reorder;
    });
    expect(handles().every(b => !b.disabled)).toBe(true);
    expect(reorderTeamTags).toHaveBeenCalledTimes(1);
  });
});
