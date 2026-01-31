'use client';

import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getTeamInvites,
  createTeamInvite,
  type TeamInviteResponse,
} from '@/services/teamService';
import { ApiError } from '@/types/api';

export type UseTeamInviteReturn = {
  invites: TeamInviteResponse[];
  showModal: boolean;
  isCreating: boolean;
  createdInviteLink: string | null;
  setInvites: (invites: TeamInviteResponse[]) => void;
  setShowModal: (show: boolean) => void;
  setCreatedInviteLink: (link: string | null) => void;
  handleCreateInvite: (expiresInDays: number, usageMaxCnt?: number) => Promise<void>;
  fetchInvites: () => Promise<void>;
};

/**
 * 팀 초대 관리 훅
 * TeamBoard에서 초대 관련 로직을 분리
 */
export function useTeamInvite(
  teamId: number,
  accessToken: string | undefined
): UseTeamInviteReturn {
  const [invites, setInvites] = useState<TeamInviteResponse[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createdInviteLink, setCreatedInviteLink] = useState<string | null>(null);

  // 초대 목록 가져오기
  const fetchInvites = useCallback(async () => {
    if (!accessToken) return;

    try {
      const invitesResponse = await getTeamInvites(teamId, accessToken);
      setInvites(invitesResponse.data);
    } catch (err) {
      if (err instanceof ApiError && err.isForbiddenError()) {
        console.warn('팀 초대 링크 조회 권한이 없습니다.');
        setInvites([]);
      } else {
        console.error('Failed to fetch team invites:', err);
        setInvites([]);
      }
    }
  }, [accessToken, teamId]);

  // 초대 링크 생성
  const handleCreateInvite = useCallback(
    async (expiresInDays: number, usageMaxCnt?: number) => {
      if (!accessToken) return;

      setIsCreating(true);
      try {
        const days = Math.min(3, Math.max(1, Math.floor(expiresInDays)));
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + days);
        endDate.setHours(23, 59, 59, 999);

        const request: { endAt: string; usageMaxCnt?: number } = {
          endAt: endDate.toISOString(),
        };
        if (typeof usageMaxCnt === 'number') {
          request.usageMaxCnt = usageMaxCnt;
        }

        await createTeamInvite(teamId, request, accessToken);

        toast.success('초대 링크가 성공적으로 생성되었습니다!');
        setShowModal(false);
        setCreatedInviteLink(null);

        // 초대 링크 목록 새로고침
        await fetchInvites();
      } catch (err) {
        const errorMessage = err instanceof ApiError 
          ? err.message 
          : err instanceof Error 
            ? err.message 
            : '초대 링크 생성에 실패했습니다.';
        toast.error(errorMessage);
        console.error('Failed to create invite:', err);
      } finally {
        setIsCreating(false);
      }
    },
    [accessToken, teamId, fetchInvites]
  );

  return {
    invites,
    showModal,
    isCreating,
    createdInviteLink,
    setInvites,
    setShowModal,
    setCreatedInviteLink,
    handleCreateInvite,
    fetchInvites,
  };
}
