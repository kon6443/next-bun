'use client';

import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getTelegramStatus,
  createTelegramLink,
  deleteTelegramLink,
  type TelegramStatusResponse,
} from '@/services/teamService';
import { extractErrorMessage } from '@/app/utils/errorUtils';

export type UseTelegramLinkReturn = {
  telegramStatus: TelegramStatusResponse | null;
  isLoading: boolean;
  isCreating: boolean;
  isDeleting: boolean;
  showDeleteConfirm: boolean;
  setTelegramStatus: (status: TelegramStatusResponse | null) => void;
  handleCreateLink: () => Promise<void>;
  requestDeleteLink: () => void;
  confirmDeleteLink: () => Promise<void>;
  cancelDeleteLink: () => void;
  handleRefreshStatus: () => Promise<void>;
};

/**
 * 텔레그램 연동 관리 훅
 */
export function useTelegramLink(
  teamId: number,
  accessToken: string | undefined
): UseTelegramLinkReturn {
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
      toast.error(extractErrorMessage(err, '텔레그램 연동 링크 생성에 실패했습니다.'));
      console.error('Failed to create telegram link:', err);
    } finally {
      setIsCreating(false);
    }
  }, [accessToken, teamId]);

  const requestDeleteLink = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  const cancelDeleteLink = useCallback(() => {
    setShowDeleteConfirm(false);
  }, []);

  const confirmDeleteLink = useCallback(async () => {
    if (!accessToken) return;

    setIsDeleting(true);
    try {
      await deleteTelegramLink(teamId, accessToken);

      setTelegramStatus({
        isLinked: false,
        chatId: null,
      });

      toast.success('텔레그램 연동이 해제되었습니다.');
    } catch (err) {
      toast.error(extractErrorMessage(err, '텔레그램 연동 해제에 실패했습니다.'));
      console.error('Failed to delete telegram link:', err);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [accessToken, teamId]);

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
    showDeleteConfirm,
    setTelegramStatus,
    handleCreateLink,
    requestDeleteLink,
    confirmDeleteLink,
    cancelDeleteLink,
    handleRefreshStatus,
  };
}
