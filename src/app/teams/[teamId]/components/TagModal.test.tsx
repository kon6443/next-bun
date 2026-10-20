// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import type { TeamTag } from '@/app/types/task';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const teamTags: TeamTag[] = [
  { tagId: 1, tagName: '버그', tagColor: '#38BDF8', sortOrder: 1, taskCount: 2 },
  { tagId: 2, tagName: '디자인', tagColor: '#A78BFA', sortOrder: 2, taskCount: 0 },
];
const updateTag = vi.fn();
// 컨텍스트 함수는 실제처럼 렌더마다 같은 참조여야 한다(모달의 열기 effect가 refresh에 의존)
const tagsContext: { tags: TeamTag[] } & Record<string, unknown> = {
  tags: teamTags,
  isLoading: false,
  isReordering: false,
  refresh: vi.fn(() => Promise.resolve(true)),
  createTag: vi.fn(),
  updateTag,
  deleteTag: vi.fn(),
  reorderTags: vi.fn(),
};
vi.mock('../contexts/TeamTagsContext', () => ({
  useTeamTagsContext: () => tagsContext,
  useTeamTagsContextOptional: () => null,
}));

import { TagModal } from './TagModal';

/** 모달 하단 "닫기"·헤더 X(aria-label "닫기")를 함께 센다 */
const closeButtons = () => screen.queryAllByRole('button', { name: '닫기' });
const openEditor = (tagName = '버그') => fireEvent.click(screen.getByRole('button', { name: `${tagName} 태그 수정` }));
const discardDialog = () => screen.queryByRole('dialog', { name: '수정 중인 태그' });

beforeEach(() => {
  updateTag.mockReset();
  updateTag.mockResolvedValue({ ...teamTags[0] });
  tagsContext.tags = teamTags;
});
afterEach(cleanup);

describe('TagModal — 태그 수정 중 footer', () => {
  it('편집을 열면 footer의 "닫기"가 "취소 / 저장"으로 바뀌고, 취소하면 되돌아온다', () => {
    render(<TagModal isOpen onClose={() => {}} mode="manage" />);
    expect(closeButtons()).toHaveLength(2); // 헤더 X + footer 닫기

    openEditor();
    expect(closeButtons()).toHaveLength(1); // 헤더 X만
    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(closeButtons()).toHaveLength(2);
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
  });

  it('footer 저장이 편집 폼을 제출해 바뀐 색만 저장한다', async () => {
    render(<TagModal isOpen onClose={() => {}} mode="manage" />);
    openEditor();
    fireEvent.click(screen.getByRole('button', { name: '추천 색 #F87171' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(updateTag).toHaveBeenCalledWith(1, { tagColor: '#F87171' }));
  });

  it('이름 칸에서 Enter로도 저장한다', async () => {
    render(<TagModal isOpen onClose={() => {}} mode="manage" />);
    openEditor();
    const nameInput = screen.getByLabelText(/^이름/);
    fireEvent.change(nameInput, { target: { value: '버그 수정' } });
    fireEvent.keyDown(nameInput, { key: 'Enter' });
    await waitFor(() => expect(updateTag).toHaveBeenCalledWith(1, { tagName: '버그 수정' }));
  });

  it('태스크 폼 안(select 모드)에서 저장해도 바깥 폼이 제출되지 않는다', async () => {
    const onOuterSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onOuterSubmit}>
        <TagModal isOpen onClose={() => {}} mode="select" selectedTagIds={[]} onSelectedTagIdsChange={() => {}} />
      </form>,
    );
    openEditor();
    fireEvent.click(screen.getByRole('button', { name: '추천 색 #F87171' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(updateTag).toHaveBeenCalled());
    expect(onOuterSubmit).not.toHaveBeenCalled();
  });
});

describe('TagModal — 저장하지 않은 변경', () => {
  it('변경이 없으면 확인 없이 닫힌다', () => {
    const onClose = vi.fn();
    render(<TagModal isOpen onClose={onClose} mode="manage" />);
    openEditor();
    fireEvent.click(closeButtons()[0]);
    expect(discardDialog()).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('변경이 있으면 X에서 확인창 — "계속 편집"은 편집을 유지하고 "변경 버리기"는 닫는다', () => {
    const onClose = vi.fn();
    render(<TagModal isOpen onClose={onClose} mode="manage" />);
    openEditor();
    fireEvent.click(screen.getByRole('button', { name: '추천 색 #F87171' }));

    fireEvent.click(closeButtons()[0]);
    expect(discardDialog()).toHaveTextContent('저장하지 않은 변경을 버릴까요?');
    fireEvent.click(within(discardDialog()!).getByRole('button', { name: '계속 편집' }));
    expect(discardDialog()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument();

    fireEvent.click(closeButtons()[0]);
    fireEvent.click(within(discardDialog()!).getByRole('button', { name: '변경 버리기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('변경이 있을 때 Esc는 확인창을 띄우고, 확인창의 Esc는 확인창만 닫는다', () => {
    const onClose = vi.fn();
    render(<TagModal isOpen onClose={onClose} mode="manage" />);
    openEditor();
    fireEvent.click(screen.getByRole('button', { name: '추천 색 #F87171' }));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(discardDialog()).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(discardDialog()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument();
  });

  it('확인창이 열려 있는 동안 Tab 포커스는 확인창 안에 머문다 — 모달의 포커스 가두기가 끼어들지 않는다', () => {
    render(<TagModal isOpen onClose={() => {}} mode="manage" />);
    openEditor();
    fireEvent.click(screen.getByRole('button', { name: '추천 색 #F87171' }));
    fireEvent.click(closeButtons()[0]);

    const dialog = discardDialog()!;
    expect(dialog.contains(document.activeElement)).toBe(true);
    const buttons = within(dialog).getAllByRole('button');
    buttons[buttons.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('변경이 있을 때 다른 태그 편집으로 넘어가기 전에도 묻는다', () => {
    render(<TagModal isOpen onClose={() => {}} mode="select" selectedTagIds={[]} onSelectedTagIdsChange={() => {}} />);
    openEditor('버그');
    fireEvent.click(screen.getByRole('button', { name: '추천 색 #F87171' }));
    openEditor('디자인');
    expect(discardDialog()).not.toBeNull();
    fireEvent.click(within(discardDialog()!).getByRole('button', { name: '변경 버리기' }));
    expect(screen.getByRole('button', { name: '디자인 태그 수정' })).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('TagModal — 리뷰 1라운드 회귀', () => {
  it('같은 태그의 연필을 다시 눌러 "변경 버리기"를 고르면 편집이 닫히고 고친 내용이 버려진다', () => {
    render(<TagModal isOpen onClose={() => {}} mode="manage" />);
    openEditor();
    fireEvent.click(screen.getByRole('button', { name: '추천 색 #F87171' }));
    openEditor(); // 같은 태그 연필 = 편집 접기
    fireEvent.click(within(discardDialog()!).getByRole('button', { name: '변경 버리기' }));

    expect(screen.getByRole('button', { name: '버그 태그 수정' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
    openEditor(); // 다시 열면 원래 색
    expect(screen.getByRole('button', { name: '추천 색 #F87171' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('저장 요청이 진행 중이면 X·다른 태그 편집이 "버리기"를 묻지 않고 기다린다', async () => {
    let finishSave: () => void = () => {};
    updateTag.mockImplementation(() => new Promise<void>(resolve => (finishSave = resolve)));
    const onClose = vi.fn();
    render(<TagModal isOpen onClose={onClose} mode="manage" />);
    openEditor();
    fireEvent.click(screen.getByRole('button', { name: '추천 색 #F87171' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('button', { name: '저장 중...' });

    fireEvent.click(closeButtons()[0]);
    openEditor('디자인');
    expect(discardDialog()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    finishSave();
    await waitFor(() => expect(screen.queryByRole('button', { name: '저장 중...' })).toBeNull());
  });

  it('편집 중 다른 팀원이 같은 태그를 바꿔도, 내가 손대지 않았으면 확인 없이 닫히고 내가 고친 칸만 저장한다', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<TagModal isOpen onClose={onClose} mode="manage" />);
    openEditor();

    // 소켓 tagUpdated로 색이 바뀐 목록이 들어온다
    tagsContext.tags = [{ ...teamTags[0], tagColor: '#34D399' }, teamTags[1]];
    rerender(<TagModal isOpen onClose={onClose} mode="manage" />);

    const nameInput = screen.getByLabelText(/^이름/);
    fireEvent.change(nameInput, { target: { value: '버그 수정' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(updateTag).toHaveBeenCalledWith(1, { tagName: '버그 수정' }));
  });

  it('편집 중 다른 팀원 변경만 있고 내가 고친 것이 없으면 X로 바로 닫힌다', () => {
    const onClose = vi.fn();
    const { rerender } = render(<TagModal isOpen onClose={onClose} mode="manage" />);
    openEditor();
    tagsContext.tags = [{ ...teamTags[0], tagName: '버그(바뀜)' }, teamTags[1]];
    rerender(<TagModal isOpen onClose={onClose} mode="manage" />);

    fireEvent.click(closeButtons()[0]);
    expect(discardDialog()).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('TagModal — 리뷰 2라운드 회귀', () => {
  // jsdom에는 scrollIntoView가 없다 — 테스트마다 심고 끝나면 지운다
  let scrollIntoView: ReturnType<typeof vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>>;
  beforeEach(() => {
    scrollIntoView = vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>();
    Element.prototype.scrollIntoView = scrollIntoView;
  });
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it('편집 중 닫았다가 다시 열면 이전 편집 행으로 스크롤하지 않는다', () => {
    const { rerender } = render(<TagModal isOpen onClose={() => {}} mode="manage" />);
    openEditor('디자인');
    expect(scrollIntoView).toHaveBeenCalledTimes(1); // 열 때 한 번

    fireEvent.click(closeButtons()[0]);
    rerender(<TagModal isOpen={false} onClose={() => {}} mode="manage" />);
    rerender(<TagModal isOpen onClose={() => {}} mode="manage" />);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
  });

  it('footer 저장의 이름 오류는 이름 칸 바로 아래에 붙어 보인다', () => {
    render(<TagModal isOpen onClose={() => {}} mode="manage" />);
    openEditor();
    const nameInput = screen.getByLabelText(/^이름/);
    fireEvent.change(nameInput, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    const alert = screen.getByRole('alert');
    // 아래로 내려가 저장했어도 이름 칸까지 올려 보여 준다
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(nameInput);
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput.getAttribute('aria-describedby')).toBe(alert.id);
    expect(nameInput.parentElement).toContainElement(alert);
    expect(updateTag).not.toHaveBeenCalled();
  });

  it('이름을 고치지 않았으면, 그사이 다른 태그가 내 옛 이름을 가져가도 색만 바꾼 저장은 막히지 않는다', async () => {
    const { rerender } = render(<TagModal isOpen onClose={() => {}} mode="manage" />);
    openEditor('버그');
    tagsContext.tags = [
      { ...teamTags[0], tagName: '버그(바뀜)' },
      { ...teamTags[1], tagName: '버그' },
    ];
    rerender(<TagModal isOpen onClose={() => {}} mode="manage" />);

    fireEvent.click(screen.getByRole('button', { name: '추천 색 #F87171' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(updateTag).toHaveBeenCalledWith(1, { tagColor: '#F87171' }));
  });
});
