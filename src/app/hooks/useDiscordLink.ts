'use client';

import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getDiscordStatus,
  saveDiscordWebhook,
  deleteDiscordWebhook,
  type DiscordStatusResponse,
} from '@/services/teamService';
import { extractErrorMessage } from '@/app/utils/errorUtils';

export type UseDiscordLinkReturn = {
  discordStatus: DiscordStatusResponse | null;
  isLoading: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  setDiscordStatus: (status: DiscordStatusResponse | null) => void;
  handleSaveWebhook: (webhookUrl: string) => Promise<void>;
  handleDeleteWebhook: () => Promise<void>;
  handleRefreshStatus: () => Promise<void>;
};

/**
 * 디스코드 연동 관리 훅
 */
export function useDiscordLink(
  teamId: number,
  accessToken: string | undefined
): UseDiscordLinkReturn {
  const [discordStatus, setDiscordStatus] = useState<DiscordStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSaveWebhook = useCallback(async (webhookUrl: string) => {
    if (!accessToken) return;

    setIsSaving(true);
    try {
      await saveDiscordWebhook(teamId, webhookUrl, accessToken);

      setDiscordStatus({
        isLinked: true,
        webhookUrl,
      });
      toast.success('디스코드 Webhook이 저장되었습니다.');
    } catch (err) {
      toast.error(extractErrorMessage(err, '디스코드 Webhook 저장에 실패했습니다.'));
      console.error('Failed to save discord webhook:', err);
    } finally {
      setIsSaving(false);
    }
  }, [accessToken, teamId]);

  const handleDeleteWebhook = useCallback(async () => {
    if (!accessToken) return;

    const confirmed = window.confirm('디스코드 연동을 해제하시겠습니까?\n연동 해제 후에는 디스코드로 팀 알림을 받을 수 없습니다.');
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await deleteDiscordWebhook(teamId, accessToken);

      setDiscordStatus({
        isLinked: false,
        webhookUrl: null,
      });

      toast.success('디스코드 연동이 해제되었습니다.');
    } catch (err) {
      toast.error(extractErrorMessage(err, '디스코드 연동 해제에 실패했습니다.'));
      console.error('Failed to delete discord webhook:', err);
    } finally {
      setIsDeleting(false);
    }
  }, [accessToken, teamId]);

  const handleRefreshStatus = useCallback(async () => {
    if (!accessToken) return;

    setIsLoading(true);
    try {
      const response = await getDiscordStatus(teamId, accessToken);
      setDiscordStatus(response.data);
    } catch (err) {
      console.error('Failed to refresh discord status:', err);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, teamId]);

  return {
    discordStatus,
    isLoading,
    isSaving,
    isDeleting,
    setDiscordStatus,
    handleSaveWebhook,
    handleDeleteWebhook,
    handleRefreshStatus,
  };
}
