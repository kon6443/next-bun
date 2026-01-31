'use client';

import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getTelegramStatus,
  createTelegramLink,
  deleteTelegramLink,
  type TelegramStatusResponse,
} from '@/services/teamService';
import { ApiError } from '@/types/api';

export type UseTelegramLinkReturn = {
  telegramStatus: TelegramStatusResponse | null;
  isLoading: boolean;
  isCreating: boolean;
  isDeleting: boolean;
  setTelegramStatus: (status: TelegramStatusResponse | null) => void;
  handleCreateLink: () => Promise<void>;
  handleDeleteLink: () => Promise<void>;
  handleRefreshStatus: () => Promise<void>;
};

/**
 * 텔레그램 연동 관리 훅
 * TeamBoard에서 텔레그램 관련 로직을 분리
 */
export function useTelegramLink(
  teamId: number,
  accessToken: string | undefined
): UseTelegramLinkReturn {
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // 텔레그램 연동 링크 생성
  const handleCreateLink = useCallback(async () => {
    if (!accessToken) return;

    setIsCreating(true);
    try {
      const response = await createTelegramLink(teamId, accessToken);

      setTelegramStatus({
        isLinked: false,
        chatId: null,
        pendingLink: {
          token: response.data.token,
          deepLink: response.data.deepLink,
          endAt: response.data.endAt,
        },
      });
      toast.success('텔레그램 연동 링크가 생성되었습니다.');
    } catch (err) {
      const errorMessage = err instanceof ApiError 
        ? err.message 
        : err instanceof Error 
          ? err.message 
          : '텔레그램 연동 링크 생성에 실패했습니다.';
      toast.error(errorMessage);
      console.error('Failed to create telegram link:', err);
    } finally {
      setIsCreating(false);
    }
  }, [accessToken, teamId]);

  // 텔레그램 연동 해제
  const handleDeleteLink = useCallback(async () => {
    if (!accessToken) return;

    const confirmed = window.confirm('텔레그램 연동을 해제하시겠습니까?\n연동 해제 후에는 팀 알림을 받을 수 없습니다.');
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await deleteTelegramLink(teamId, accessToken);

      setTelegramStatus({
        isLinked: false,
        chatId: null,
      });

      toast.success('텔레그램 연동이 해제되었습니다.');
    } catch (err) {
      const errorMessage = err instanceof ApiError 
        ? err.message 
        : err instanceof Error 
          ? err.message 
          : '텔레그램 연동 해제에 실패했습니다.';
      toast.error(errorMessage);
      console.error('Failed to delete telegram link:', err);
    } finally {
      setIsDeleting(false);
    }
  }, [accessToken, teamId]);

  // 텔레그램 상태 새로고침
  const handleRefreshStatus = useCallback(async () => {
    if (!accessToken) return;

    setIsLoading(true);
    try {
      const response = await getTelegramStatus(teamId, accessToken);
      setTelegramStatus(response.data);
    } catch (err) {
      console.error('Failed to refresh telegram status:', err);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, teamId]);

  return {
    telegramStatus,
    isLoading,
    isCreating,
    isDeleting,
    setTelegramStatus,
    handleCreateLink,
    handleDeleteLink,
    handleRefreshStatus,
  };
}
