// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// 채팅 패널이 쓰는 컨텍스트만 최소로 흉내 낸다
const closeChat = vi.fn();
vi.mock('../contexts', () => ({
  useTeamChatContext: () => ({
    messages: [],
    members: [],
    hasMoreOlder: false,
    isLoadingOlder: false,
    isHistoryLoaded: true,
    isChatOpen: true,
    closeChat,
    sendMessage: vi.fn(),
    loadOlder: vi.fn(),
    currentUserId: 7,
  }),
}));

import { TutorialGuide, shouldAutoShowTutorial, markTutorialSeen } from './TutorialGuide';
import { TeamChatPanel } from './TeamChatPanel';

afterEach(() => {
  cleanup();
  closeChat.mockReset();
});

describe('TutorialGuide 대화상자', () => {
  it('대화상자로 읽히고, 열리면 포커스가 안으로 들어가며 Esc로 닫힌다', () => {
    const onClose = vi.fn();
    render(<TutorialGuide isOpen onClose={onClose} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName();
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('닫기 버튼은 44px 터치 영역을 가진다', () => {
    render(<TutorialGuide isOpen onClose={() => {}} />);
    expect(screen.getByRole('button', { name: '닫기' })).toHaveClass('h-11', 'w-11');
  });
});

describe('튜토리얼 자동 표시', () => {
  afterEach(() => localStorage.clear());

  it('다른 대화상자(채팅·태그 관리 등)가 열려 있으면 미루고, 모두 닫히면 띄운다', () => {
    const ready = { isLoading: false, hasError: false };
    expect(shouldAutoShowTutorial({ ...ready, isOtherDialogOpen: true })).toBe(false);
    expect(shouldAutoShowTutorial({ ...ready, isOtherDialogOpen: false })).toBe(true);
  });

  it('로딩 중·오류·이미 본 경우에는 띄우지 않는다', () => {
    expect(shouldAutoShowTutorial({ isLoading: true, hasError: false, isOtherDialogOpen: false })).toBe(false);
    expect(shouldAutoShowTutorial({ isLoading: false, hasError: true, isOtherDialogOpen: false })).toBe(false);
    markTutorialSeen();
    expect(shouldAutoShowTutorial({ isLoading: false, hasError: false, isOtherDialogOpen: false })).toBe(false);
  });
});

describe('TeamChatPanel 대화상자', () => {
  it('포커스가 입력창 밖에 있어도 Esc로 닫히고, 입력창에서 Esc를 눌러도 한 번만 닫는다', () => {
    render(<TeamChatPanel />);
    const dialog = screen.getByRole('dialog', { name: '팀 채팅' });
    expect(dialog.contains(document.activeElement)).toBe(true);

    screen.getByRole('button', { name: '닫기' }).focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeChat).toHaveBeenCalledTimes(1);

    closeChat.mockReset();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(closeChat).toHaveBeenCalledTimes(1);
  });

  it('Tab이 대화상자 밖으로 나가지 않는다', () => {
    render(
      <>
        <button>바깥 버튼</button>
        <TeamChatPanel />
      </>,
    );
    const dialog = screen.getByRole('dialog', { name: '팀 채팅' });
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), textarea'));
    focusable[focusable.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('닫기 버튼은 44px 터치 영역을 가진다', () => {
    render(<TeamChatPanel />);
    expect(screen.getByRole('button', { name: '닫기' })).toHaveClass('h-11', 'w-11');
  });
});
