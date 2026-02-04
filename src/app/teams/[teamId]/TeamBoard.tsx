'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import toast from 'react-hot-toast';

import { GanttChart } from '../../components/GanttChart';
import { ListView } from '../../components/ListView';
import { CalendarView } from '../../components/CalendarView';
import { TaskFilters } from '../../components/TaskFilters';
import { Kanban } from '../../components/Kanban';
import { SectionLabel, ErrorAlert, TeamBoardSkeleton, ListViewSkeleton, Skeleton, FAB, IconButton } from '../components';
import { EditIcon, UserGroupIcon, PlusIcon } from '../../components/Icons';
import type { Task } from '../../types/task';
import { useTaskFilter, useTelegramLink, useTeamInvite, useTeamSocket, useTeamSocketEvents } from '../../hooks';
import {
  getTeamTasks,
  updateTaskStatus,
  getTeamUsers,
  getTelegramStatus,
  updateMemberRole,
  type TeamUserResponse,
} from '@/services/teamService';
import { teamsPageBackground, cardStyles, layoutStyles, MOBILE_MAX_WIDTH } from '@/styles/teams';
import { STATUS_TO_COLUMN, type ColumnKey } from '../../config/taskStatusConfig';
import { TeamManagementSection, InviteModal, RoleChangeModal, ViewModeToggle, OnlineUsers, type ViewMode } from './components';
import { ROLES } from '../../config/roleConfig';
import type {
  TaskCreatedPayload,
  TaskUpdatedPayload,
  TaskStatusChangedPayload,
  TaskActiveStatusChangedPayload,
  OnlineUserInfo,
  UserJoinedPayload,
  UserLeftPayload,
  OnlineUsersPayload,
  MemberRoleChangedPayload,
} from '@/types/socket';

// taskStatus를 ColumnKey로 매핑
const taskStatusToColumn: Record<number, ColumnKey | undefined> = {
  1: STATUS_TO_COLUMN[1] ?? undefined,
  2: STATUS_TO_COLUMN[2] ?? undefined,
  3: STATUS_TO_COLUMN[3] ?? undefined,
  4: STATUS_TO_COLUMN[4] ?? undefined,
  5: STATUS_TO_COLUMN[5] ?? undefined,
};

type TeamBoardProps = {
  teamId: string;
};

const validViewModes: ViewMode[] = ['kanban', 'gantt', 'list', 'calendar'];

export default function TeamBoard({ teamId }: TeamBoardProps) {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL 쿼리에서 viewMode 읽기
  const getViewModeFromQuery = useCallback((): ViewMode => {
    const viewParam = searchParams.get('view');
    if (viewParam && validViewModes.includes(viewParam as ViewMode)) {
      return viewParam as ViewMode;
    }
    return 'kanban';
  }, [searchParams]);

  const teamIdNum = parseInt(teamId, 10);

  const [tasks, setTasks] = useState<Record<ColumnKey, Task[]>>({
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
  const [onlineUsers, setOnlineUsers] = useState<OnlineUserInfo[]>([]);

  // 역할 변경 모달 상태
  const [showRoleChangeModal, setShowRoleChangeModal] = useState(false);
  const [roleChangeTarget, setRoleChangeTarget] = useState<TeamUserResponse | null>(null);
  const [isChangingRole, setIsChangingRole] = useState(false);

  // 커스텀 훅으로 분리된 로직
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

  // ===== WebSocket 연결 =====
  const { socket } = useTeamSocket(teamIdNum, session?.user?.accessToken);

  // Socket 이벤트 핸들러 (useCallback으로 메모이제이션)
  const handleSocketTaskCreated = useCallback(
    (payload: TaskCreatedPayload) => {
      // 새 태스크를 해당 컬럼에 추가
      const columnKey = taskStatusToColumn[payload.taskStatus] || 'todo';

      // 작성자 이름을 팀 멤버 목록에서 찾기
      const creator = members.find(m => m.userId === payload.createdBy);
      const userName = creator?.userName ?? '알 수 없음';

      const newTask: Task = {
        taskId: payload.taskId,
        teamId: payload.teamId,
        taskName: payload.taskName,
        taskDescription: payload.taskDescription,
        taskStatus: payload.taskStatus,
        actStatus: payload.actStatus,
        startAt: payload.startAt ? new Date(payload.startAt) : null,
        endAt: payload.endAt ? new Date(payload.endAt) : null,
        crtdBy: payload.createdBy,
        crtdAt: new Date(),
        userName,
      };

      if (payload.actStatus === 1) {
        setTasks(prev => ({
          ...prev,
          [columnKey]: [...prev[columnKey], newTask],
        }));
        toast.success('새 태스크가 추가되었습니다.');
      }
    },
    [members],
  );

  const handleSocketTaskUpdated = useCallback((payload: TaskUpdatedPayload) => {
    setTasks(prev => {
      const newTasks = { ...prev };
      // 모든 컬럼에서 해당 태스크 찾아서 업데이트
      for (const columnKey of Object.keys(newTasks) as ColumnKey[]) {
        const taskIndex = newTasks[columnKey].findIndex(t => t.taskId === payload.taskId);
        if (taskIndex !== -1) {
          newTasks[columnKey] = newTasks[columnKey].map(task =>
            task.taskId === payload.taskId
              ? {
                  ...task,
                  ...(payload.taskName !== undefined && { taskName: payload.taskName }),
                  ...(payload.taskDescription !== undefined && { taskDescription: payload.taskDescription }),
                  ...(payload.startAt !== undefined && { startAt: payload.startAt ? new Date(payload.startAt) : null }),
                  ...(payload.endAt !== undefined && { endAt: payload.endAt ? new Date(payload.endAt) : null }),
                }
              : task,
          );
          break;
        }
      }
      return newTasks;
    });
    toast.success('태스크가 수정되었습니다.');
  }, []);

  const handleSocketTaskStatusChanged = useCallback((payload: TaskStatusChangedPayload) => {
    const newColumnKey = taskStatusToColumn[payload.newStatus];
    if (!newColumnKey) return;

    setTasks(prev => {
      let movedTask: Task | undefined;
      let sourceColumnKey: ColumnKey | undefined;

      // 모든 컬럼에서 태스크 찾기
      for (const columnKey of Object.keys(prev) as ColumnKey[]) {
        const foundTask = prev[columnKey].find(t => t.taskId === payload.taskId);
        if (foundTask) {
          movedTask = foundTask;
          sourceColumnKey = columnKey;
          break;
        }
      }

      // 태스크를 찾지 못했으면 변경 없음
      if (!movedTask || !sourceColumnKey) {
        return prev;
      }

      // 같은 컬럼 내 이동이면 상태값만 업데이트
      if (sourceColumnKey === newColumnKey) {
        return {
          ...prev,
          [sourceColumnKey]: prev[sourceColumnKey].map(task =>
            task.taskId === payload.taskId
              ? { ...task, taskStatus: payload.newStatus }
              : task,
          ),
        };
      }

      // 다른 컬럼으로 이동: 불변성을 유지하며 업데이트
      const updatedTask = { ...movedTask, taskStatus: payload.newStatus };

      return {
        ...prev,
        // 원본 컬럼에서 제거 (filter로 새 배열 생성)
        [sourceColumnKey]: prev[sourceColumnKey].filter(t => t.taskId !== payload.taskId),
        // 대상 컬럼에 추가 (spread로 새 배열 생성)
        [newColumnKey]: [...prev[newColumnKey], updatedTask],
      };
    });
    toast.success('태스크 상태가 변경되었습니다.');
  }, []);

  const handleSocketTaskActiveStatusChanged = useCallback((payload: TaskActiveStatusChangedPayload) => {
    // actStatus가 0(비활성)으로 변경되면 목록에서 제거
    if (payload.newActStatus === 0) {
      setTasks(prev => {
        const newTasks = { ...prev };
        for (const columnKey of Object.keys(newTasks) as ColumnKey[]) {
          newTasks[columnKey] = newTasks[columnKey].filter(t => t.taskId !== payload.taskId);
        }
        return newTasks;
      });
      toast.success('태스크가 비활성화되었습니다.');
    }
  }, []);

  // 온라인 유저 접속 이벤트
  const handleUserJoined = useCallback((payload: UserJoinedPayload) => {
    setOnlineUsers(prev => {
      const existingIndex = prev.findIndex(u => u.userId === payload.userId);
      if (existingIndex >= 0) {
        // 기존 유저 업데이트 (다중 탭 접속)
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          connectionCount: payload.connectionCount,
        };
        return updated;
      } else {
        // 새 유저 추가
        return [...prev, {
          userId: payload.userId,
          userName: payload.userName,
          connectionCount: payload.connectionCount,
        }];
      }
    });
    // 첫 접속일 때만 토스트 표시 (다중 탭 아닌 경우)
    if (payload.connectionCount === 1) {
      toast(`${payload.userName}님이 접속했습니다`, {
        icon: '🟢',
        duration: 2000,
        style: {
          background: '#1e293b',
          color: '#e2e8f0',
          border: '1px solid rgba(16, 185, 129, 0.2)',
        },
      });
    }
  }, []);

  // 온라인 유저 퇴장 이벤트
  const handleUserLeft = useCallback((payload: UserLeftPayload) => {
    setOnlineUsers(prev => {
      if (payload.connectionCount === 0) {
        // 완전히 오프라인 → 목록에서 제거
        return prev.filter(u => u.userId !== payload.userId);
      } else {
        // 다중 탭 중 일부만 종료 → 카운트만 업데이트
        return prev.map(u =>
          u.userId === payload.userId
            ? { ...u, connectionCount: payload.connectionCount }
            : u
        );
      }
    });
    // 완전히 오프라인일 때만 토스트 표시
    if (payload.connectionCount === 0) {
      toast(`${payload.userName}님이 퇴장했습니다`, {
        icon: '🔴',
        duration: 2000,
        style: {
          background: '#1e293b',
          color: '#e2e8f0',
          border: '1px solid rgba(239, 68, 68, 0.2)',
        },
      });
    }
  }, []);

  // 온라인 유저 목록 이벤트 (첫 접속 시)
  const handleOnlineUsers = useCallback((payload: OnlineUsersPayload) => {
    setOnlineUsers(payload.users);
  }, []);

  // 멤버 역할 변경 이벤트
  const handleMemberRoleChanged = useCallback((payload: MemberRoleChangedPayload) => {
    // 멤버 목록에서 해당 유저의 역할 업데이트
    setMembers(prev => 
      prev.map(member => 
        member.userId === payload.userId
          ? { ...member, role: payload.newRole }
          : member
      )
    );

    // 토스트 알림
    const roleLabel = ROLES[payload.newRole as keyof typeof ROLES]?.label || payload.newRole;
    toast(`${payload.userName || `사용자 ${payload.userId}`}님의 역할이 ${roleLabel}로 변경되었습니다`, {
      icon: '🔄',
      duration: 3000,
      style: {
        background: '#1e293b',
        color: '#e2e8f0',
        border: '1px solid rgba(99, 102, 241, 0.2)',
      },
    });
  }, []);

  // Socket 이벤트 리스너 등록
  useTeamSocketEvents(
    socket,
    {
      onTaskCreated: handleSocketTaskCreated,
      onTaskUpdated: handleSocketTaskUpdated,
      onTaskStatusChanged: handleSocketTaskStatusChanged,
      onTaskActiveStatusChanged: handleSocketTaskActiveStatusChanged,
      onUserJoined: handleUserJoined,
      onUserLeft: handleUserLeft,
      onOnlineUsers: handleOnlineUsers,
      onMemberRoleChanged: handleMemberRoleChanged,
    },
    session?.user?.userId,
  );

  // viewMode는 URL 쿼리에서 파생
  const viewMode = getViewModeFromQuery();

  // viewMode 변경 시 URL 업데이트
  const setViewMode = useCallback(
    (mode: ViewMode) => {
      const params = new URLSearchParams(searchParams.toString());
      if (mode === 'kanban') {
        params.delete('view');
      } else {
        params.set('view', mode);
      }
      const queryString = params.toString();
      router.push(`${pathname}${queryString ? `?${queryString}` : ''}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // fetchInvites와 setTelegramStatus를 ref로 관리하여 useEffect 의존성에서 제외
  const fetchInvitesRef = useRef(fetchInvites);
  const setTelegramStatusRef = useRef(setTelegramStatus);
  
  // 최신 함수 참조 유지
  useEffect(() => {
    fetchInvitesRef.current = fetchInvites;
    setTelegramStatusRef.current = setTelegramStatus;
  }, [fetchInvites, setTelegramStatus]);

  useEffect(() => {
    // 세션이 아직 로딩 중이면 기다림
    if (sessionStatus === 'loading') {
      return;
    }

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
        const classifiedTasks: Record<ColumnKey, Task[]> = {
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
  }, [teamId, teamIdNum, session?.user?.accessToken, session?.user?.userId, sessionStatus]);

  // 모든 태스크를 하나의 배열로 합침
  const allTasks = useMemo(
    () => [...tasks.todo, ...tasks.inProgress, ...tasks.done, ...tasks.onHold, ...tasks.cancelled],
    [tasks],
  );

  // 필터 훅 사용
  const {
    filters,
    setSearchQuery,
    setAssigneeId,
    setPeriod,
    setStatus,
    resetFilters,
    filteredTasks,
    stats,
    assignees,
    hasActiveFilters,
  } = useTaskFilter(allTasks);

  // 필터된 태스크를 컬럼별로 분류
  const filteredTasksByColumn = useMemo(() => {
    const result: Record<ColumnKey, Task[]> = {
      todo: [],
      inProgress: [],
      done: [],
      onHold: [],
      cancelled: [],
    };
    filteredTasks.forEach(task => {
      const columnKey = taskStatusToColumn[task.taskStatus] || 'todo';
      result[columnKey].push(task);
    });
    return result;
  }, [filteredTasks]);

  // 통계 카드 데이터
  const statsCards = useMemo(
    () => [
      {
        label: '진행률',
        value: `${stats.completionRate}%`,
        helper: `완료 ${stats.completed} / 전체 ${stats.total}`,
      },
      {
        label: '진행 중',
        value: stats.inProgress,
        helper: '현재 집중 작업',
      },
      {
        label: '지연됨',
        value: stats.overdue,
        helper: '마감일 초과',
        alert: stats.overdue > 0,
      },
      {
        label: '마감 임박',
        value: stats.dueToday + stats.dueSoon,
        helper: `오늘 ${stats.dueToday} / D-3 ${stats.dueSoon}`,
        warning: stats.dueToday > 0,
      },
    ],
    [stats],
  );

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
        const teamIdNum = parseInt(teamId, 10);
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
    [session?.user?.accessToken, tasks, teamId],
  );

  // 역할 변경 모달 열기
  const handleOpenRoleChange = useCallback((member: TeamUserResponse) => {
    setRoleChangeTarget(member);
    setShowRoleChangeModal(true);
  }, []);

  // 역할 변경 모달 닫기
  const handleCloseRoleChange = useCallback(() => {
    setShowRoleChangeModal(false);
    setRoleChangeTarget(null);
  }, []);

  // 역할 변경 처리
  const handleRoleChange = useCallback(
    async (newRole: 'MANAGER' | 'MEMBER') => {
      if (!roleChangeTarget || !session?.user?.accessToken) return;

      setIsChangingRole(true);
      try {
        await updateMemberRole(
          teamIdNum,
          roleChangeTarget.userId,
          { newRole },
          session.user.accessToken,
        );

        // API 성공 시 로컬 상태 업데이트 (WebSocket 이벤트로도 업데이트되지만 즉시 반영)
        setMembers(prev =>
          prev.map(member =>
            member.userId === roleChangeTarget.userId
              ? { ...member, role: newRole }
              : member
          )
        );

        toast.success('역할이 변경되었습니다.');
        handleCloseRoleChange();
      } catch (err) {
        console.error('Failed to change role:', err);
        toast.error(err instanceof Error ? err.message : '역할 변경에 실패했습니다.');
      } finally {
        setIsChangingRole(false);
      }
    },
    [roleChangeTarget, session?.user?.accessToken, teamIdNum, handleCloseRoleChange],
  );

  // 현재 사용자의 역할 가져오기
  const currentUserMember = members.find(m => m.userId === session?.user?.userId);
  const currentUserRole = currentUserMember?.role || 'MEMBER';

  return (
    <div className={layoutStyles.pageContainer} style={teamsPageBackground}>
      <main className={`${layoutStyles.mainContent} ${MOBILE_MAX_WIDTH}`}>
        {/* 팀 헤더 섹션 */}
        <section className={`${cardStyles.section} p-4`}>
          <div className="flex items-center justify-between mb-4">
            <SectionLabel>Team Kanban</SectionLabel>
            {/* 온라인 유저 미니뷰 */}
            <OnlineUsers users={onlineUsers} currentUserId={session?.user?.userId} />
          </div>
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h1 className="text-3xl font-bold text-white truncate">
                  {isLoading ? <Skeleton width="200px" height="2rem" /> : teamName || ''}
                </h1>
                {teamDescription && <p className="mt-2 text-sm text-slate-400">{teamDescription}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <IconButton
                  icon={PlusIcon}
                  label="새 카드 작성"
                  variant="outlined"
                  href={`/teams/${teamId}/tasks/new`}
                />
                {canManageInvites && (
                  <IconButton
                    icon={UserGroupIcon}
                    label="팀 초대"
                    variant="outlined"
                    onClick={() => setShowInviteModal(true)}
                  />
                )}
                <IconButton
                  icon={EditIcon}
                  label="팀 수정"
                  variant="outlined"
                  href={`/teams/${teamId}/edit`}
                />
              </div>
            </div>
          </div>
        </section>

        {/* 팀 관리 섹션 */}
        <TeamManagementSection
          members={members}
          currentUserId={session?.user?.userId}
          statsCards={statsCards}
          canManageInvites={canManageInvites}
          invites={invites}
          telegramStatus={telegramStatus}
          isLoadingTelegram={isLoadingTelegram}
          isCreatingTelegramLink={isCreatingTelegramLink}
          isDeletingTelegramLink={isDeletingTelegramLink}
          onCreateTelegramLink={handleCreateTelegramLink}
          onDeleteTelegramLink={handleDeleteTelegramLink}
          onRefreshTelegramStatus={handleRefreshTelegramStatus}
          onOpenRoleChange={handleOpenRoleChange}
        />

        {error && <ErrorAlert message={error} className="text-center" />}

        {/* 필터 UI */}
        <TaskFilters
          searchQuery={filters.searchQuery}
          onSearchChange={setSearchQuery}
          assigneeId={filters.assigneeId}
          onAssigneeChange={setAssigneeId}
          assignees={assignees}
          period={filters.period}
          onPeriodChange={setPeriod}
          status={filters.status}
          onStatusChange={setStatus}
          taskCounts={{
            total: stats.total,
            todo: stats.todo,
            inProgress: stats.inProgress,
            done: stats.completed,
            onHold: stats.onHold,
            cancelled: stats.cancelled,
          }}
          hasActiveFilters={hasActiveFilters}
          onResetFilters={resetFilters}
          currentUserId={session?.user?.userId}
        />

        {/* 필터 결과 표시 */}
        {hasActiveFilters && (
          <div className="text-xs text-slate-500 mt-2">
            {filteredTasks.length}개 태스크 표시 중 (전체 {allTasks.length}개)
          </div>
        )}

        {/* 보기 전환 버튼 */}
        <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />

        {/* 뷰 렌더링 - 로딩 시 스켈레톤 표시 */}
        {isLoading ? (
          viewMode === 'list' ? <ListViewSkeleton /> : <TeamBoardSkeleton />
        ) : viewMode === 'kanban' ? (
          <Kanban tasksByColumn={filteredTasksByColumn} onStatusChange={handleStatusChange} teamId={teamId} />
        ) : viewMode === 'gantt' ? (
          <GanttChart tasks={filteredTasks} teamId={teamId} />
        ) : viewMode === 'list' ? (
          <ListView tasks={filteredTasks} teamId={teamId} />
        ) : (
          <CalendarView tasks={filteredTasks} teamId={teamId} />
        )}
      </main>

      {/* 초대 링크 생성 모달 */}
      <InviteModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onCreateInvite={handleCreateInvite}
        isCreating={isCreatingInvite}
        createdInviteLink={createdInviteLink}
        onClearCreatedLink={() => setCreatedInviteLink(null)}
      />

      {/* 역할 변경 모달 */}
      <RoleChangeModal
        isOpen={showRoleChangeModal}
        onClose={handleCloseRoleChange}
        onSubmit={handleRoleChange}
        isSubmitting={isChangingRole}
        targetUser={
          roleChangeTarget
            ? {
                userId: roleChangeTarget.userId,
                userName: roleChangeTarget.userName,
                currentRole: roleChangeTarget.role,
              }
            : null
        }
        actorRole={currentUserRole}
      />

      {/* FAB: 새 카드 작성 */}
      <FAB href={`/teams/${teamId}/tasks/new`} label="새 카드 작성" />
    </div>
  );
}
