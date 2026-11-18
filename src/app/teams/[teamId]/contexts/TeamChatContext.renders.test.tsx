// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { TeamSocketEvents } from '@/types/socket';

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { accessToken: 'tok', userId: 7 } } }),
}));

// 소켓은 on으로 등록된 핸들러를 모아 두고 테스트가 직접 호출한다
const socketHandlers = new Map<string, (payload: unknown) => void>();
const fakeSocket = {
  on: (event: string, handler: (payload: unknown) => void) => void socketHandlers.set(event, handler),
  off: (event: string) => void socketHandlers.delete(event),
};
const emit = (event: string, payload: unknown) => act(() => socketHandlers.get(event)?.(payload));
// 실제 컨텍스트처럼 emit 함수는 렌더마다 같은 참조
const socketValue = { socket: fakeSocket, roomJoinCount: 0, emitChatMessage: vi.fn(), emitChatRead: vi.fn() };
vi.mock('./TeamSocketContext', () => ({
  useTeamSocketContext: () => socketValue,
}));

// 보정 조회는 끝나지 않게 둔다 — 소켓 수신만으로 값이 바뀌는 상황을 본다
vi.mock('@/services/teamService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/teamService')>()),
  getChatReadState: () => new Promise(() => {}),
  getChatMessages: () => new Promise(() => {}),
}));

import { TeamChatProvider, useTeamChatContext, useTeamChatOpen, useTeamChatUnreadCount } from './TeamChatContext';

const renders = { open: 0, unread: 0, full: 0 };
let lastUnread = -1;

function OpenConsumer() {
  useTeamChatOpen();
  renders.open++;
  return null;
}
function UnreadConsumer() {
  lastUnread = useTeamChatUnreadCount();
  renders.unread++;
  return null;
}
function FullConsumer() {
  useTeamChatContext();
  renders.full++;
  return null;
}

afterEach(() => {
  cleanup();
  socketHandlers.clear();
  renders.open = renders.unread = renders.full = 0;
});

describe('TeamChatProvider 구독 분리 — 보드(열림 상태 구독자)는 채팅 메시지·읽음 변화로 다시 그려지지 않는다', () => {
  it('남의 메시지 수신·읽음 갱신: 열림 구독자 0회, 안읽음 구독자는 안읽음이 바뀔 때만, 전체 구독자는 메시지마다', () => {
    render(
      <TeamChatProvider teamId={1}>
        <OpenConsumer />
        <UnreadConsumer />
        <FullConsumer />
      </TeamChatProvider>,
    );
    const before = { ...renders };

    emit(TeamSocketEvents.CHAT_RECEIVED, { messageId: 101, teamId: 1, userId: 8, userName: '나', message: '안녕', timestamp: '2026-11-17T00:00:00Z' });
    emit(TeamSocketEvents.CHAT_RECEIVED, { messageId: 102, teamId: 1, userId: 8, userName: '나', message: '두번째', timestamp: '2026-11-17T00:00:01Z' });
    emit(TeamSocketEvents.CHAT_READ_UPDATED, { teamId: 1, userId: 8, lastReadMessageId: 102 });

    expect(renders.open - before.open).toBe(0);
    expect(lastUnread).toBe(2);
    expect(renders.unread - before.unread).toBe(2);
    // 비교 기준: 전체 값을 구독하면(수정 전 TeamBoard) 메시지마다 다시 그려진다
    expect(renders.full - before.full).toBeGreaterThanOrEqual(2);
  });
});
