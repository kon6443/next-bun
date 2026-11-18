'use client';

import {
  getTelegramStatus,
  createTelegramLink,
  deleteTelegramLink,
  type TelegramStatusResponse,
} from '@/services/teamService';
import { type IntegrationLinkConfig, useIntegrationLink } from './useIntegrationLink';

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

const TELEGRAM_LINK: IntegrationLinkConfig<TelegramStatusResponse, []> = {
  fetchStatus: getTelegramStatus,
  // 링크를 만들면 아직 연결 전 — 봇에서 시작하기 전까지 대기 링크만 있다
  link: async (teamId, accessToken) => {
    const response = await createTelegramLink(teamId, accessToken);
    return {
      isLinked: false,
      chatId: null,
      pendingLink: {
        token: response.data.token,
        deepLink: response.data.deepLink,
        endAt: response.data.endAt,
      },
    };
  },
  unlink: deleteTelegramLink,
  unlinkedStatus: { isLinked: false, chatId: null },
  messages: {
    linked: '텔레그램 연동 링크가 생성되었습니다.',
    linkFailed: '텔레그램 연동 링크 생성에 실패했습니다.',
    unlinked: '텔레그램 연동이 해제되었습니다.',
    unlinkFailed: '텔레그램 연동 해제에 실패했습니다.',
  },
  logs: {
    link: 'Failed to create telegram link:',
    unlink: 'Failed to delete telegram link:',
    refresh: 'Failed to refresh telegram status:',
  },
};

/**
 * 텔레그램 연동 관리 훅 — 흐름은 useIntegrationLink 공통, 여기는 텔레그램 API·문구와 기존 반환 이름
 */
export function useTelegramLink(
  teamId: number,
  accessToken: string | undefined
): UseTelegramLinkReturn {
  const link = useIntegrationLink(TELEGRAM_LINK, teamId, accessToken);
  return {
    telegramStatus: link.status,
    isLoading: link.isLoading,
    isCreating: link.isLinking,
    isDeleting: link.isDeleting,
    showDeleteConfirm: link.showDeleteConfirm,
    setTelegramStatus: link.setStatus,
    handleCreateLink: link.link,
    requestDeleteLink: link.requestDelete,
    confirmDeleteLink: link.confirmDelete,
    cancelDeleteLink: link.cancelDelete,
    handleRefreshStatus: link.refresh,
  };
}
