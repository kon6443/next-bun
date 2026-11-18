'use client';

import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { extractErrorMessage } from '@/app/utils/errorUtils';

/**
 * 팀 외부 연동(텔레그램·디스코드) 공통 상태 훅 — 상태 조회·연결(저장)·해제 확인 흐름이 같아 하나로 둔다.
 * 연동마다 다른 것(API 호출, 연결 뒤 상태, 해제 뒤 상태, 토스트 문구)은 config로 받는다.
 * config는 모듈 상수로 넘긴다 — 렌더마다 새 객체면 콜백이 매번 바뀐다
 */
export type IntegrationLinkConfig<TStatus, TArgs extends unknown[]> = {
  /** 현재 상태 조회 */
  fetchStatus: (teamId: number, accessToken: string) => Promise<{ data: TStatus }>;
  /** 연결(링크 생성·Webhook 저장) — 성공하면 바뀐 상태를 돌려준다 */
  link: (teamId: number, accessToken: string, ...args: TArgs) => Promise<TStatus>;
  /** 해제 */
  unlink: (teamId: number, accessToken: string) => Promise<unknown>;
  /** 해제 뒤 상태 */
  unlinkedStatus: TStatus;
  messages: { linked: string; linkFailed: string; unlinked: string; unlinkFailed: string };
  /** console.error 첫 문장 — 연동별로 로그를 구분한다 */
  logs: { link: string; unlink: string; refresh: string };
};

export type IntegrationLinkState<TStatus, TArgs extends unknown[]> = {
  status: TStatus | null;
  setStatus: (status: TStatus | null) => void;
  isLoading: boolean;
  isLinking: boolean;
  isDeleting: boolean;
  showDeleteConfirm: boolean;
  link: (...args: TArgs) => Promise<void>;
  requestDelete: () => void;
  confirmDelete: () => Promise<void>;
  cancelDelete: () => void;
  refresh: () => Promise<void>;
};

export function useIntegrationLink<TStatus, TArgs extends unknown[]>(
  config: IntegrationLinkConfig<TStatus, TArgs>,
  teamId: number,
  accessToken: string | undefined,
): IntegrationLinkState<TStatus, TArgs> {
  const [status, setStatus] = useState<TStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const link = useCallback(
    async (...args: TArgs) => {
      if (!accessToken) return;

      setIsLinking(true);
      try {
        setStatus(await config.link(teamId, accessToken, ...args));
        toast.success(config.messages.linked);
      } catch (err) {
        toast.error(extractErrorMessage(err, config.messages.linkFailed));
        console.error(config.logs.link, err);
      } finally {
        setIsLinking(false);
      }
    },
    [config, accessToken, teamId],
  );

  const requestDelete = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  const cancelDelete = useCallback(() => {
    setShowDeleteConfirm(false);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!accessToken) return;

    setIsDeleting(true);
    try {
      await config.unlink(teamId, accessToken);
      setStatus(config.unlinkedStatus);
      toast.success(config.messages.unlinked);
    } catch (err) {
      toast.error(extractErrorMessage(err, config.messages.unlinkFailed));
      console.error(config.logs.unlink, err);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [config, accessToken, teamId]);

  const refresh = useCallback(async () => {
    if (!accessToken) return;

    setIsLoading(true);
    try {
      const response = await config.fetchStatus(teamId, accessToken);
      setStatus(response.data);
    } catch (err) {
      console.error(config.logs.refresh, err);
    } finally {
      setIsLoading(false);
    }
  }, [config, accessToken, teamId]);

  return { status, setStatus, isLoading, isLinking, isDeleting, showDeleteConfirm, link, requestDelete, confirmDelete, cancelDelete, refresh };
}
