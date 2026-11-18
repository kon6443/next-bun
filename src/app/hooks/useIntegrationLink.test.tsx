// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ApiError } from '@/types/api';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toast }));

const api = vi.hoisted(() => ({
  getTelegramStatus: vi.fn(),
  createTelegramLink: vi.fn(),
  deleteTelegramLink: vi.fn(),
  getDiscordStatus: vi.fn(),
  saveDiscordWebhook: vi.fn(),
  deleteDiscordWebhook: vi.fn(),
}));
vi.mock('@/services/teamService', () => api);

import { useTelegramLink } from './useTelegramLink';
import { useDiscordLink } from './useDiscordLink';

afterEach(() => {
  vi.clearAllMocks();
});

describe('useTelegramLink (공통 useIntegrationLink 위)', () => {
  it('링크 생성: 대기 링크 상태로 바꾸고 성공 토스트', async () => {
    api.createTelegramLink.mockResolvedValue({ data: { token: 't', deepLink: 'https://t.me/x', endAt: '2026-11-20T00:00:00Z' } });
    const { result } = renderHook(() => useTelegramLink(7, 'tok'));
    await act(() => result.current.handleCreateLink());
    expect(api.createTelegramLink).toHaveBeenCalledWith(7, 'tok');
    expect(result.current.telegramStatus).toEqual({
      isLinked: false,
      chatId: null,
      pendingLink: { token: 't', deepLink: 'https://t.me/x', endAt: '2026-11-20T00:00:00Z' },
    });
    expect(result.current.isCreating).toBe(false);
    expect(toast.success).toHaveBeenCalledWith('텔레그램 연동 링크가 생성되었습니다.');
  });

  it('링크 생성 실패: 서버 문구(없으면 기본 문구)로 오류 토스트, 상태는 그대로', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.createTelegramLink.mockRejectedValueOnce(new ApiError('FORBIDDEN', '권한이 없습니다.', 403));
    const { result } = renderHook(() => useTelegramLink(7, 'tok'));
    await act(() => result.current.handleCreateLink());
    expect(toast.error).toHaveBeenLastCalledWith('권한이 없습니다.');
    expect(result.current.telegramStatus).toBeNull();

    api.createTelegramLink.mockRejectedValueOnce('network down');
    await act(() => result.current.handleCreateLink());
    expect(toast.error).toHaveBeenLastCalledWith('텔레그램 연동 링크 생성에 실패했습니다.');
  });

  it('해제: 확인을 열고 → 확정하면 해제 상태로, 확인은 닫힌다(실패해도 닫힘)', async () => {
    api.deleteTelegramLink.mockResolvedValue(undefined);
    const { result } = renderHook(() => useTelegramLink(7, 'tok'));
    act(() => result.current.requestDeleteLink());
    expect(result.current.showDeleteConfirm).toBe(true);
    await act(() => result.current.confirmDeleteLink());
    expect(result.current.telegramStatus).toEqual({ isLinked: false, chatId: null });
    expect(result.current.showDeleteConfirm).toBe(false);
    expect(toast.success).toHaveBeenCalledWith('텔레그램 연동이 해제되었습니다.');

    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.deleteTelegramLink.mockRejectedValueOnce('network down');
    act(() => result.current.requestDeleteLink());
    await act(() => result.current.confirmDeleteLink());
    expect(toast.error).toHaveBeenLastCalledWith('텔레그램 연동 해제에 실패했습니다.');
    expect(result.current.showDeleteConfirm).toBe(false);
  });

  it('상태 새로고침: 응답 data로 바꾼다, 실패하면 토스트 없이 상태 유지', async () => {
    api.getTelegramStatus.mockResolvedValueOnce({ data: { isLinked: true, chatId: '1' } });
    const { result } = renderHook(() => useTelegramLink(7, 'tok'));
    await act(() => result.current.handleRefreshStatus());
    expect(result.current.telegramStatus).toEqual({ isLinked: true, chatId: '1' });

    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.getTelegramStatus.mockRejectedValueOnce('network down');
    await act(() => result.current.handleRefreshStatus());
    expect(result.current.telegramStatus).toEqual({ isLinked: true, chatId: '1' });
    expect(result.current.isLoading).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('토큰이 없으면 아무 요청도 하지 않는다', async () => {
    const { result } = renderHook(() => useTelegramLink(7, undefined));
    await act(() => result.current.handleCreateLink());
    await act(() => result.current.confirmDeleteLink());
    await act(() => result.current.handleRefreshStatus());
    expect(api.createTelegramLink).not.toHaveBeenCalled();
    expect(api.deleteTelegramLink).not.toHaveBeenCalled();
    expect(api.getTelegramStatus).not.toHaveBeenCalled();
  });

  it('콜백은 렌더가 바뀌어도 같은 참조 — 토큰·팀이 같으면', () => {
    const { result, rerender } = renderHook(() => useTelegramLink(7, 'tok'));
    const first = result.current;
    rerender();
    expect(result.current.handleCreateLink).toBe(first.handleCreateLink);
    expect(result.current.confirmDeleteLink).toBe(first.confirmDeleteLink);
    expect(result.current.handleRefreshStatus).toBe(first.handleRefreshStatus);
  });
});

describe('useDiscordLink (공통 useIntegrationLink 위)', () => {
  it('Webhook 저장: 입력한 URL로 연결 상태, 성공 토스트', async () => {
    api.saveDiscordWebhook.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDiscordLink(7, 'tok'));
    await act(() => result.current.handleSaveWebhook('https://discord.com/api/webhooks/1'));
    expect(api.saveDiscordWebhook).toHaveBeenCalledWith(7, 'https://discord.com/api/webhooks/1', 'tok');
    expect(result.current.discordStatus).toEqual({ isLinked: true, webhookUrl: 'https://discord.com/api/webhooks/1' });
    expect(result.current.isSaving).toBe(false);
    expect(toast.success).toHaveBeenCalledWith('디스코드 Webhook이 저장되었습니다.');
  });

  it('저장 실패·해제', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.saveDiscordWebhook.mockRejectedValueOnce('network down');
    api.deleteDiscordWebhook.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDiscordLink(7, 'tok'));
    await act(() => result.current.handleSaveWebhook('x'));
    expect(toast.error).toHaveBeenLastCalledWith('디스코드 Webhook 저장에 실패했습니다.');
    expect(result.current.discordStatus).toBeNull();

    act(() => result.current.requestDeleteWebhook());
    await act(() => result.current.confirmDeleteWebhook());
    expect(result.current.discordStatus).toEqual({ isLinked: false, webhookUrl: null });
    expect(result.current.showDeleteConfirm).toBe(false);
    expect(toast.success).toHaveBeenCalledWith('디스코드 연동이 해제되었습니다.');
  });
});
