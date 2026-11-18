'use client';

import {
  getDiscordStatus,
  saveDiscordWebhook,
  deleteDiscordWebhook,
  type DiscordStatusResponse,
} from '@/services/teamService';
import { type IntegrationLinkConfig, useIntegrationLink } from './useIntegrationLink';

export type UseDiscordLinkReturn = {
  discordStatus: DiscordStatusResponse | null;
  isLoading: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  showDeleteConfirm: boolean;
  setDiscordStatus: (status: DiscordStatusResponse | null) => void;
  handleSaveWebhook: (webhookUrl: string) => Promise<void>;
  requestDeleteWebhook: () => void;
  confirmDeleteWebhook: () => Promise<void>;
  cancelDeleteWebhook: () => void;
  handleRefreshStatus: () => Promise<void>;
};

const DISCORD_LINK: IntegrationLinkConfig<DiscordStatusResponse, [webhookUrl: string]> = {
  fetchStatus: getDiscordStatus,
  link: async (teamId, accessToken, webhookUrl) => {
    await saveDiscordWebhook(teamId, webhookUrl, accessToken);
    return { isLinked: true, webhookUrl };
  },
  unlink: deleteDiscordWebhook,
  unlinkedStatus: { isLinked: false, webhookUrl: null },
  messages: {
    linked: '디스코드 Webhook이 저장되었습니다.',
    linkFailed: '디스코드 Webhook 저장에 실패했습니다.',
    unlinked: '디스코드 연동이 해제되었습니다.',
    unlinkFailed: '디스코드 연동 해제에 실패했습니다.',
  },
  logs: {
    link: 'Failed to save discord webhook:',
    unlink: 'Failed to delete discord webhook:',
    refresh: 'Failed to refresh discord status:',
  },
};

/**
 * 디스코드 연동 관리 훅 — 흐름은 useIntegrationLink 공통, 여기는 디스코드 API·문구와 기존 반환 이름
 */
export function useDiscordLink(
  teamId: number,
  accessToken: string | undefined
): UseDiscordLinkReturn {
  const link = useIntegrationLink(DISCORD_LINK, teamId, accessToken);
  return {
    discordStatus: link.status,
    isLoading: link.isLoading,
    isSaving: link.isLinking,
    isDeleting: link.isDeleting,
    showDeleteConfirm: link.showDeleteConfirm,
    setDiscordStatus: link.setStatus,
    handleSaveWebhook: link.link,
    requestDeleteWebhook: link.requestDelete,
    confirmDeleteWebhook: link.confirmDelete,
    cancelDeleteWebhook: link.cancelDelete,
    handleRefreshStatus: link.refresh,
  };
}
