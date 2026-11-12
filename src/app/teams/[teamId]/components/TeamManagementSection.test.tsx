// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { TeamUserResponse } from '@/services/teamService';
import { TeamManagementSection } from './TeamManagementSection';

afterEach(cleanup);

const member = (overrides: Partial<TeamUserResponse>): TeamUserResponse => ({
  userId: 1,
  userName: '가',
  teamNickname: '가',
  role: 'MEMBER',
  joinedAt: null,
  userActStatus: 1,
  ...overrides,
});

function renderSection(members: TeamUserResponse[]) {
  const noop = vi.fn();
  const asyncNoop = vi.fn().mockResolvedValue(undefined);
  render(
    <TeamManagementSection
      members={members}
      currentUserId={1}
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
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '펼치기' }));
}

describe('TeamManagementSection', () => {
  it('가입일: 날짜가 있으면 한국어 날짜, 없으면 "-" (Invalid Date 금지)', () => {
    renderSection([
      member({ userId: 1, userName: '가입일있음', joinedAt: new Date('2026-10-20T03:00:00Z') }),
      member({ userId: 2, userName: '가입일없음', joinedAt: null }),
    ]);
    // 헤더 요약(span)과 탭 버튼이 같은 title — 탭 버튼을 누른다
    fireEvent.click(screen.getAllByTitle('멤버').find((el) => el.tagName === 'BUTTON')!);

    const expected = new Date('2026-10-20T03:00:00Z').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    expect(screen.getByText(`가입일: ${expected}`)).toBeInTheDocument();
    expect(screen.getByText('가입일: -')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  });
});
