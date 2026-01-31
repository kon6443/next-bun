'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import type { Task } from '../types/task';
import {
  getTeamTasks,
  updateTaskStatus,
  getTeamUsers,
  getTelegramStatus,
  type TeamUserResponse,
} from '@/services/teamService';
import { STATUS_TO_COLUMN, type ColumnKey } from '../config/taskStatusConfig';
import { useTelegramLink, useTeamInvite } from './index';

// taskStatus를 ColumnKey로 매핑
const taskStatusToColumn: Record<number, ColumnKey | undefined> = {
  1: STATUS_TO_COLUMN[1] ?? undefined,
  2: STATUS_TO_COLUMN[2] ?? undefined,
  3: STATUS_TO_COLUMN[3] ?? undefined,
  4: STATUS_TO_COLUMN[4] ?? undefined,
  5: STATUS_TO_COLUMN[5] ?? undefined,
};

export type TasksByColumn = Record<ColumnKey, Task[]>;

export type UseTeamDataReturn = {
  // 팀 정보
  teamName: string;
  teamDescription: string;
  members: TeamUserResponse[];
  canManageInvites: boolean;
  
  // 태스크
  tasks: TasksByColumn;
  handleStatusChange: (taskId: number, newStatus: number) => Promise<void>;
  
  // 로딩/에러
  isLoading: boolean;
  error: string | null;
  
  // 텔레그램
  telegramStatus: ReturnType<typeof useTelegramLink>['telegramStatus'];
  isLoadingTelegram: boolean;
  isCreatingTelegramLink: boolean;
  isDeletingTelegramLink: boolean;
  handleCreateTelegramLink: () => Promise<void>;
  handleDeleteTelegramLink: () => Promise<void>;
  handleRefreshTelegramStatus: () => Promise<void>;
  
  // 초대
  invites: ReturnType<typeof useTeamInvite>['invites'];
  showInviteModal: boolean;
  setShowInviteModal: (show: boolean) => void;
  isCreatingInvite: boolean;
  createdInviteLink: string | null;
  setCreatedInviteLink: (link: string | null) => void;
  handleCreateInvite: (expiresInDays: number, usageMaxCnt?: number) => Promise<void>;
};

/**
 * 팀 데이터 관리 훅
 * TeamBoard에서 데이터 페칭/관리 로직을 분리
 */
export function useTeamData(teamId: string): UseTeamDataReturn {
  const { data: session } = useSession();
  const teamIdNum = parseInt(teamId, 10);

  const [tasks, setTasks] = useState<TasksByColumn>({
    todo: [],
    inProgress: [],
    done: [],
    onHold: [],
    cancelled: [],
  });
  const [teamName, setTeamName] = useState<string>('');
  const [teamDescription, setTeamDescription] = useState<string>('');
  const [members, setMembers] = useState<TeamUserResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canManageInvites, setCanManageInvites] = useState(false);

  // 텔레그램 훅
  const {
    telegramStatus,
    isLoading: isLoadingTelegram,
    isCreating: isCreatingTelegramLink,
    isDeleting: isDeletingTelegramLink,
    setTelegramStatus,
    handleCreateLink: handleCreateTelegramLink,
    handleDeleteLink: handleDeleteTelegramLink,
    handleRefreshStatus: handleRefreshTelegramStatus,
  } = useTelegramLink(teamIdNum, session?.user?.accessToken);

  // 초대 훅
  const {
    invites,
    showModal: showInviteModal,
    isCreating: isCreatingInvite,
    createdInviteLink,
    setShowModal: setShowInviteModal,
    setCreatedInviteLink,
    handleCreateInvite,
    fetchInvites,
  } = useTeamInvite(teamIdNum, session?.user?.accessToken);

  // ref로 관리하여 useEffect 의존성에서 제외
  const fetchInvitesRef = useRef(fetchInvites);
  const setTelegramStatusRef = useRef(setTelegramStatus);

  useEffect(() => {
    fetchInvitesRef.current = fetchInvites;
    setTelegramStatusRef.current = setTelegramStatus;
  }, [fetchInvites, setTelegramStatus]);

  // 팀 데이터 페칭
  useEffect(() => {
    if (!session?.user?.accessToken) {
      setError('인증이 필요합니다. 다시 로그인해주세요.');
      setIsLoading(false);
      return;
    }

    const fetchTeamData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        if (isNaN(teamIdNum)) {
          throw new Error('유효하지 않은 팀 ID입니다.');
        }

        const currentUserId = session.user.userId;

        // Promise.all로 독립적인 API들을 병렬 호출
        const [tasksResponse, membersResult, telegramResult] = await Promise.all([
          getTeamTasks(teamIdNum, session.user.accessToken),
          getTeamUsers(teamIdNum, session.user.accessToken).catch(err => {
            console.error('Failed to fetch team members:', err);
            return null;
          }),
          getTelegramStatus(teamIdNum, session.user.accessToken).catch(err => {
            console.error('Failed to fetch telegram status:', err);
            return null;
          }),
        ]);

        // 태스크 데이터 처리
        setTeamName(tasksResponse.data.team.teamName);
        setTeamDescription(tasksResponse.data.team.teamDescription || '');

        const isMasterUser = Boolean(currentUserId && tasksResponse.data.team.leaderId === currentUserId);

        // 멤버 데이터 처리
        if (membersResult) {
          setMembers(membersResult.data);

          const currentUserMember = membersResult.data.find(m => m.userId === currentUserId);
          const userRole = currentUserMember?.role?.toUpperCase().trim();
          const canInvite = userRole === 'MASTER' || userRole === 'MANAGER';
          setCanManageInvites(canInvite);

          if (canInvite) {
            await fetchInvitesRef.current();
          }
        } else {
          setCanManageInvites(isMasterUser);
          if (isMasterUser) {
            await fetchInvitesRef.current();
          }
        }

        // 텔레그램 데이터 처리
        setTelegramStatusRef.current(telegramResult?.data ?? null);

        // taskStatus에 따라 태스크를 컬럼별로 분류
        const classifiedTasks: TasksByColumn = {
          todo: [],
          inProgress: [],
          done: [],
          onHold: [],
          cancelled: [],
        };

        tasksResponse.data.tasks.forEach(task => {
          if (task.actStatus === 1) {
            const columnKey = taskStatusToColumn[task.taskStatus] || 'todo';
            classifiedTasks[columnKey].push(task);
          }
        });

        setTasks(classifiedTasks);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '태스크 목록을 불러오는데 실패했습니다.';
        setError(errorMessage);
        console.error('Failed to fetch team data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTeamData();
  }, [teamId, teamIdNum, session?.user?.accessToken, session?.user?.userId]);

  // 상태 변경 함수
  const handleStatusChange = useCallback(
    async (taskId: number, newStatus: number) => {
      if (!session?.user?.accessToken) return;

      let currentTask: Task | undefined;
      let currentColumn: ColumnKey | undefined;

      for (const [columnKey, columnTasks] of Object.entries(tasks) as [ColumnKey, Task[]][]) {
        const found = columnTasks.find(t => t.taskId === taskId);
        if (found) {
          currentTask = found;
          currentColumn = columnKey;
          break;
        }
      }

      if (!currentTask || !currentColumn) return;

      const newColumn = taskStatusToColumn[newStatus];
      if (!newColumn) {
        console.warn(`컬럼에 매핑되지 않은 상태: ${newStatus}`);
        return;
      }

      // 낙관적 업데이트
      setTasks(prev => {
        const sourceItems = [...prev[currentColumn]];
        const targetItems = currentColumn === newColumn ? sourceItems : [...prev[newColumn]];

        const taskIndex = sourceItems.findIndex(t => t.taskId === taskId);
        if (taskIndex === -1) return prev;

        const [movedTask] = sourceItems.splice(taskIndex, 1);
        const updatedTask = { ...movedTask, taskStatus: newStatus };

        if (currentColumn === newColumn) return prev;

        targetItems.push(updatedTask);

        return {
          ...prev,
          [currentColumn]: sourceItems,
          [newColumn]: targetItems,
        };
      });

      // API 호출
      try {
        await updateTaskStatus(teamIdNum, taskId, newStatus, session.user.accessToken);
        toast.success('상태가 변경되었습니다.');
      } catch (err) {
        console.error('Failed to update task status:', err);
        toast.error(err instanceof Error ? err.message : '태스크 상태 변경에 실패했습니다.');

        // 롤백
        setTasks(prev => {
          const sourceItems = [...prev[newColumn]];
          const targetItems = [...prev[currentColumn]];

          const taskIndex = sourceItems.findIndex(t => t.taskId === taskId);
          if (taskIndex === -1) return prev;

          const [movedTask] = sourceItems.splice(taskIndex, 1);
          const restoredTask = { ...movedTask, taskStatus: currentTask!.taskStatus };
          targetItems.push(restoredTask);

          return {
            ...prev,
            [newColumn]: sourceItems,
            [currentColumn]: targetItems,
          };
        });
      }
    },
    [session?.user?.accessToken, tasks, teamIdNum],
  );

  return {
    teamName,
    teamDescription,
    members,
    canManageInvites,
    tasks,
    handleStatusChange,
    isLoading,
    error,
    telegramStatus,
    isLoadingTelegram,
    isCreatingTelegramLink,
    isDeletingTelegramLink,
    handleCreateTelegramLink,
    handleDeleteTelegramLink,
    handleRefreshTelegramStatus,
    invites,
    showInviteModal,
    setShowInviteModal,
    isCreatingInvite,
    createdInviteLink,
    setCreatedInviteLink,
    handleCreateInvite,
  };
}
