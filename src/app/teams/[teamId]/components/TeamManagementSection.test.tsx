// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
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

function renderSection(members: TeamUserResponse[], { expand = true }: { expand?: boolean } = {}) {
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
  if (expand) fireEvent.click(screen.getByRole('button', { name: '펼치기' }));
}

describe('TeamManagementSection', () => {
  it('탭 버튼 이름: 인원 수가 있으면 "라벨 숫자", 없으면 라벨. 선택된 탭은 aria-pressed', () => {
    renderSection([member({ userId: 1 }), member({ userId: 2, userName: '나' })]);

    const membersTab = screen.getByRole('button', { name: '멤버 2' });
    const statsTab = screen.getByRole('button', { name: '통계' });
    // title이 이름과 다르면 설명으로 한 번 더 읽힌다
    expect(membersTab).toHaveAttribute('title', '멤버 2');
    expect(statsTab).toHaveAttribute('title', '통계');
    expect(statsTab).toHaveAttribute('aria-pressed', 'true'); // 기본 탭
    expect(membersTab).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(membersTab);
    expect(membersTab).toHaveAttribute('aria-pressed', 'true');
    expect(statsTab).toHaveAttribute('aria-pressed', 'false');
  });

  it('탭 버튼은 "팀 관리 보기 전환" 그룹으로 묶인다', () => {
    renderSection([member({ userId: 1 })]);
    const group = screen.getByRole('group', { name: '팀 관리 보기 전환' });
    expect(within(group).getByRole('button', { name: '멤버 1' })).toBeInTheDocument();
  });

  it('접힌 요약: 숫자 있는 항목은 "라벨 숫자"로 읽히고 숫자만 읽히지 않는다, 펼치면 요약은 숨겨 두 번 읽지 않는다', () => {
    renderSection([member({ userId: 1 }), member({ userId: 2, userName: '나' })], { expand: false });
    const summary = screen.getByText('멤버 2').closest('div')!;
    expect(screen.getByText('멤버 2')).toHaveClass('sr-only');
    // 보이는 아이콘+숫자는 낭독에서 빠진다
    expect(within(summary).getByText('2').closest('[aria-hidden="true"]')).not.toBeNull();
    // 툴팁(title)은 낭독에서 빠진 span에만 — 바깥(읽히는) 요소에는 없다
    summary.querySelectorAll('[title]').forEach((el) => expect(el).toHaveAttribute('aria-hidden', 'true'));
    expect(summary).not.toHaveAttribute('aria-hidden');
    // 숫자 없는 아이콘(통계 등)은 요약에 두지 않는다 — 정보 없이 자리만 차지했다
    expect(summary.querySelectorAll('[title]')).toHaveLength(1);
    expect(within(summary).queryByTitle('통계')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '펼치기' }));
    expect(summary).toHaveAttribute('aria-hidden', 'true');
  });

  it('가입일: 날짜가 있으면 한국어 날짜, 없으면 "-" (Invalid Date 금지)', () => {
    renderSection([
      member({ userId: 1, userName: '가입일있음', joinedAt: new Date('2026-10-20T03:00:00Z') }),
      member({ userId: 2, userName: '가입일없음', joinedAt: null }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: '멤버 2' }));

    const expected = new Date('2026-10-20T03:00:00Z').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    expect(screen.getByText(`가입일: ${expected}`)).toBeInTheDocument();
    expect(screen.getByText('가입일: -')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  });
});
