// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import type { MyTeamNickname, TeamNicknameSubmitResult } from '@/app/hooks/useMyTeamNickname';

const toastError = vi.fn();
vi.mock('react-hot-toast', () => ({ default: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() } }));
import { TeamNicknameInlineEditor, TeamNicknameChip } from './TeamNicknameEditor';
import { OnlineUsers } from './OnlineUsers';
import { TeamManagementSection } from './TeamManagementSection';

afterEach(() => {
  cleanup();
  toastError.mockReset();
});

const EDIT_LABEL = '이 팀에서 내 이름 바꾸기';

function fakeNickname(overrides: Partial<MyTeamNickname> = {}): MyTeamNickname {
  return {
    canEdit: true,
    currentName: '용감한수달4821',
    accountUserName: '계정이름',
    isSaving: false,
    submit: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

const input = () => screen.getByLabelText('이 팀에서 내 이름');

/** 행 편집기 — 평소엔 이름(children)+연필, 편집 중엔 그 자리가 입력 칸 */
function Row({ nickname, trailing }: { nickname: MyTeamNickname; trailing?: React.ReactNode }) {
  return (
    <TeamNicknameInlineEditor nickname={nickname} trailing={trailing}>
      <span>보이는 이름</span>
    </TeamNicknameInlineEditor>
  );
}
const submitByEnter = () => fireEvent.submit(input().closest('form')!);

describe('TeamNicknameInlineEditor', () => {
  it('같은 행: 연필 → 이름 자리가 입력 칸(현재 이름·포커스)으로, 저장 성공하면 닫히고 연필로 포커스', async () => {
    const nickname = fakeNickname();
    render(<Row nickname={nickname} trailing={<span>온라인</span>} />);

    expect(screen.getByText('보이는 이름')).toBeInTheDocument();
    expect(screen.getByText('온라인')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: EDIT_LABEL }));
    // 편집 중에는 이름·뒤따르는 표시가 입력 칸에 자리를 내준다
    expect(screen.queryByText('보이는 이름')).not.toBeInTheDocument();
    expect(screen.queryByText('온라인')).not.toBeInTheDocument();
    expect(input()).toHaveFocus();
    expect(input()).toHaveValue('용감한수달4821');
    expect(input()).toHaveAttribute('placeholder', '계정 닉네임: 계정이름');

    fireEvent.change(input(), { target: { value: '팀장님' } });
    submitByEnter();

    await waitFor(() => expect(nickname.submit).toHaveBeenCalledWith('팀장님'));
    await waitFor(() => expect(screen.getByRole('button', { name: EDIT_LABEL })).toHaveFocus());
  });

  it('실패 안내는 입력을 열어 둔 채 보여 주고 aria-invalid', async () => {
    const nickname = fakeNickname({
      submit: vi.fn().mockResolvedValue({ ok: false, message: '팀 닉네임은 20자 이하로 입력해주세요.' }),
    });
    render(<Row nickname={nickname} />);
    fireEvent.click(screen.getByRole('button', { name: EDIT_LABEL }));
    submitByEnter();

    expect(await screen.findByText('팀 닉네임은 20자 이하로 입력해주세요.')).toBeInTheDocument();
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(input()).toHaveFocus();
  });

  it('Esc는 저장 없이 닫고 포커스를 돌려준다, 바깥으로 Esc가 번지지 않는다', () => {
    const nickname = fakeNickname();
    const outerKeyDown = vi.fn();
    render(
      <div onKeyDown={outerKeyDown}>
        <Row nickname={nickname} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: EDIT_LABEL }));
    fireEvent.keyDown(input(), { key: 'Escape' });

    expect(screen.queryByLabelText('이 팀에서 내 이름')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: EDIT_LABEL })).toHaveFocus();
    expect(outerKeyDown).not.toHaveBeenCalled();
    expect(nickname.submit).not.toHaveBeenCalled();
  });

  it('저장 중이면 버튼이 잠기고 Esc로 닫히지 않는다', () => {
    render(<Row nickname={fakeNickname({ isSaving: true })} />);
    fireEvent.click(screen.getByRole('button', { name: EDIT_LABEL }));
    expect(screen.getByRole('button', { name: '저장 중' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(input()).toBeInTheDocument();
  });

  it('열어 둔 사이 다른 곳에서 이름이 바뀌면 손대지 않은 입력은 새 이름을 따른다, 고친 입력은 그대로', () => {
    const { rerender } = render(<Row nickname={fakeNickname({ currentName: 'A' })} />);
    fireEvent.click(screen.getByRole('button', { name: EDIT_LABEL }));
    rerender(<Row nickname={fakeNickname({ currentName: 'B' })} />);
    expect(input()).toHaveValue('B');

    fireEvent.change(input(), { target: { value: '내가 고침' } });
    rerender(<Row nickname={fakeNickname({ currentName: 'C' })} />);
    expect(input()).toHaveValue('내가 고침');
  });

  it('저장 중 폼이 사라진 뒤 실패하면 토스트로 알린다', async () => {
    let resolve!: (v: TeamNicknameSubmitResult) => void;
    const nickname = fakeNickname({ submit: vi.fn(() => new Promise<TeamNicknameSubmitResult>((r) => (resolve = r))) });
    const { unmount } = render(<Row nickname={nickname} />);
    fireEvent.click(screen.getByRole('button', { name: EDIT_LABEL }));
    fireEvent.change(input(), { target: { value: '새이름' } });
    submitByEnter();
    unmount();

    resolve({ ok: false, message: '활성 멤버만 팀 닉네임을 바꿀 수 있습니다.' });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('활성 멤버만 팀 닉네임을 바꿀 수 있습니다.'));
  });

  it('편집 중 자격을 잃었다 다시 얻어도 폼이 혼자 열리지 않는다', () => {
    const { rerender } = render(<Row nickname={fakeNickname()} />);
    fireEvent.click(screen.getByRole('button', { name: EDIT_LABEL }));
    rerender(<Row nickname={fakeNickname({ canEdit: false })} />);
    rerender(<Row nickname={fakeNickname()} />);
    expect(screen.queryByLabelText('이 팀에서 내 이름')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: EDIT_LABEL })).toBeInTheDocument();
  });

  it('편집 자격이 없으면(비활성 멤버 등) 이름만 그리고 연필은 없다', () => {
    render(<Row nickname={fakeNickname({ canEdit: false })} />);
    expect(screen.getByText('보이는 이름')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: EDIT_LABEL })).not.toBeInTheDocument();
  });

  it('행 편집의 저장·취소는 아이콘 버튼 — 취소 버튼으로 닫고 연필로 포커스', () => {
    render(<Row nickname={fakeNickname()} />);
    fireEvent.click(screen.getByRole('button', { name: EDIT_LABEL }));
    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.getByRole('button', { name: EDIT_LABEL })).toHaveFocus();
  });
});

describe('TeamNicknameChip (헤더 — 늘 보이는 진입점)', () => {
  it('칩 → 대화상자(입력 칸 포커스) → Esc로 닫고 칩으로 포커스 복귀', async () => {
    const onOpenChange = vi.fn();
    render(<TeamNicknameChip nickname={fakeNickname()} onOpenChange={onOpenChange} />);

    const chip = screen.getByRole('button', { name: `내 이름 용감한수달4821, ${EDIT_LABEL}` });
    chip.focus();
    fireEvent.click(chip);

    const dialog = screen.getByRole('dialog', { name: EDIT_LABEL });
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    await waitFor(() => expect(within(dialog).getByLabelText('이 팀에서 내 이름')).toHaveFocus());

    fireEvent.keyDown(within(dialog).getByLabelText('이 팀에서 내 이름'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(chip).toHaveFocus();
  });

  it('저장 성공하면 대화상자를 닫는다', async () => {
    const nickname = fakeNickname();
    render(<TeamNicknameChip nickname={nickname} />);
    fireEvent.click(screen.getByRole('button', { name: /이 팀에서 내 이름 바꾸기/ }));
    fireEvent.change(input(), { target: { value: '새이름' } });
    submitByEnter();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(nickname.submit).toHaveBeenCalledWith('새이름');
  });

  it('편집 자격이 없으면 칩을 그리지 않는다', () => {
    const { container } = render(<TeamNicknameChip nickname={fakeNickname({ canEdit: false })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('진입점은 모두 같은 컨트롤러(useMyTeamNickname 결과)를 쓴다', () => {
  const member = {
    userId: 7,
    userName: '용감한수달4821',
    teamNickname: '용감한수달4821',
    role: 'MEMBER',
    joinedAt: new Date('2026-10-20T00:00:00Z'),
    userActStatus: 1 as const,
  };

  async function saveFrom(container: HTMLElement, value: string) {
    fireEvent.click(within(container).getByRole('button', { name: EDIT_LABEL }));
    const field = within(container).getByLabelText('이 팀에서 내 이름');
    fireEvent.change(field, { target: { value } });
    fireEvent.submit(field.closest('form')!);
  }

  it('온라인 목록의 내 항목에서 바꾸면 같은 submit이 불린다 (바텀시트는 열린 채)', async () => {
    const nickname = fakeNickname();
    render(
      <OnlineUsers
        users={[{ userId: 7, userName: '용감한수달4821', connectionCount: 1 }, { userId: 8, userName: '다른사람', connectionCount: 1 }]}
        currentUserId={7}
        myNickname={nickname}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '온라인 유저 목록 보기' }));
    const sheet = screen.getByRole('dialog');
    // 내 항목에만 버튼이 있다
    expect(within(sheet).getAllByRole('button', { name: EDIT_LABEL })).toHaveLength(1);

    await saveFrom(sheet, '온라인에서');
    await waitFor(() => expect(nickname.submit).toHaveBeenCalledWith('온라인에서'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('멤버 카드(내 카드만)에서 바꾸면 같은 submit이 불린다', async () => {
    const nickname = fakeNickname();
    const noop = vi.fn();
    const asyncNoop = vi.fn().mockResolvedValue(undefined);
    render(
      <TeamManagementSection
        members={[member, { ...member, userId: 8, userName: '다른사람', teamNickname: '다른사람' }]}
        currentUserId={7}
        statsCards={[]}
        canManageInvites={false}
        invites={[]}
        onOpenInvite={noop}
        telegramStatus={null}
        isLoadingTelegram={false}
        isCreatingTelegramLink={false}
        isDeletingTelegramLink={false}
        onCreateTelegramLink={asyncNoop}
        onDeleteTelegramLink={noop}
        showTelegramDeleteConfirm={false}
        onConfirmDeleteTelegramLink={asyncNoop}
        onCancelDeleteTelegramLink={noop}
        onRefreshTelegramStatus={asyncNoop}
        discordStatus={null}
        isLoadingDiscord={false}
        isSavingDiscordWebhook={false}
        isDeletingDiscordWebhook={false}
        onSaveDiscordWebhook={asyncNoop}
        onDeleteDiscordWebhook={noop}
        showDiscordDeleteConfirm={false}
        onConfirmDeleteDiscordWebhook={asyncNoop}
        onCancelDeleteDiscordWebhook={noop}
        onRefreshDiscordStatus={asyncNoop}
        myNickname={nickname}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '펼치기' }));
    // 헤더 요약(span)과 탭 버튼이 같은 title — 탭 버튼을 누른다
    fireEvent.click(screen.getAllByTitle('멤버').find((el) => el.tagName === 'BUTTON')!);
    expect(screen.getAllByRole('button', { name: EDIT_LABEL })).toHaveLength(1);

    await saveFrom(document.body, '카드에서');
    await waitFor(() => expect(nickname.submit).toHaveBeenCalledWith('카드에서'));
  });

});
