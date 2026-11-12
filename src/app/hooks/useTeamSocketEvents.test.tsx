// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { TeamSocketEvents, type TeamSocket } from '@/types/socket';
import { useTeamSocketEvents } from './useTeamSocketEvents';

// 등록된 핸들러만 기억하는 가짜 소켓
function createFakeSocket() {
  const handlers = new Map<string, (payload: unknown) => void>();
  const socket = {
    on: (event: string, handler: (payload: unknown) => void) => void handlers.set(event, handler),
    off: (event: string) => void handlers.delete(event),
  } as unknown as TeamSocket;
  const emit = (event: string, payload: unknown) => act(() => handlers.get(event)?.(payload));
  return { socket, emit, handlers };
}

const ME = 7;

describe('useTeamSocketEvents — memberNicknameChanged', () => {
  it('본인 이벤트도 전달한다 (다른 탭 이름 동기화 — self 필터 예외)', () => {
    const { socket, emit } = createFakeSocket();
    const onMemberNicknameChanged = vi.fn();
    renderHook(() => useTeamSocketEvents(socket, { onMemberNicknameChanged }, ME));

    const payload = { teamId: 1, userId: ME, userName: '새이름', teamNickname: '새이름' };
    emit(TeamSocketEvents.MEMBER_NICKNAME_CHANGED, payload);
    expect(onMemberNicknameChanged).toHaveBeenCalledWith(payload);
  });

  it('비교: 역할 변경은 본인이 트리거하면 무시한다', () => {
    const { socket, emit } = createFakeSocket();
    const onMemberRoleChanged = vi.fn();
    renderHook(() => useTeamSocketEvents(socket, { onMemberRoleChanged }, ME));

    emit(TeamSocketEvents.MEMBER_ROLE_CHANGED, { teamId: 1, userId: 2, userName: 'a', previousRole: 'MEMBER', newRole: 'MANAGER', changedBy: ME });
    expect(onMemberRoleChanged).not.toHaveBeenCalled();
  });

  it('언마운트하면 리스너를 해제한다', () => {
    const { socket, handlers } = createFakeSocket();
    const { unmount } = renderHook(() => useTeamSocketEvents(socket, { onMemberNicknameChanged: vi.fn() }, ME));
    expect(handlers.has(TeamSocketEvents.MEMBER_NICKNAME_CHANGED)).toBe(true);
    unmount();
    expect(handlers.has(TeamSocketEvents.MEMBER_NICKNAME_CHANGED)).toBe(false);
  });
});
