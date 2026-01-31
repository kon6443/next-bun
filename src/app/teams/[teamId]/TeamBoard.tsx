'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import toast from 'react-hot-toast';

import { GanttChart } from '../../components/GanttChart';
import { ListView } from '../../components/ListView';
import { CalendarView } from '../../components/CalendarView';
import { TaskFilters } from '../../components/TaskFilters';
import { Kanban } from '../../components/Kanban';
import { Button, ButtonLink, SectionLabel, ErrorAlert, TeamBoardSkeleton, ListViewSkeleton } from '../components';
import type { Task } from '../../types/task';
import { useTaskFilter, useTelegramLink, useTeamInvite } from '../../hooks';
import {
  getTeamTasks,
  updateTaskStatus,
  getTeamUsers,
  getTelegramStatus,
  type TeamUserResponse,
} from '@/services/teamService';
import { teamsPageBackground, cardStyles, layoutStyles, MOBILE_MAX_WIDTH } from '@/styles/teams';
import { STATUS_TO_COLUMN, type ColumnKey } from '../../config/taskStatusConfig';
import { TeamManagementSection, InviteModal, ViewModeToggle, type ViewMode } from './components';

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
  const { data: session } = useSession();
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
            await fetchInvites();
          }
        } else {
          setCanManageInvites(isMasterUser);
          if (isMasterUser) {
            await fetchInvites();
          }
        }

        // 텔레그램 데이터 처리
        setTelegramStatus(telegramResult?.data ?? null);

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
  }, [teamId, teamIdNum, session?.user?.accessToken, session?.user?.userId, fetchInvites, setTelegramStatus]);

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

  return (
    <div className={layoutStyles.pageContainer} style={teamsPageBackground}>
      <main className={`${layoutStyles.mainContent} ${MOBILE_MAX_WIDTH}`}>
        {/* 팀 헤더 섹션 */}
        <section className={`${cardStyles.section} p-4`}>
          <SectionLabel>Team Kanban</SectionLabel>
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white">{isLoading ? '로딩 중...' : teamName || ''}</h1>
              {teamDescription && <p className="mt-2 text-sm text-slate-400">{teamDescription}</p>}
            </div>
            <div className="flex flex-col gap-2">
              {canManageInvites && (
                <Button variant="secondary" size="lg" fullWidth onClick={() => setShowInviteModal(true)}>
                  팀 초대
                </Button>
              )}
              <ButtonLink href={`/teams/${teamId}/edit`} variant="secondary" size="lg" fullWidth>
                팀 수정
              </ButtonLink>
              <ButtonLink href={`/teams/${teamId}/tasks/new`} size="lg" fullWidth>
                새 카드 작성
              </ButtonLink>
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
    </div>
  );
}
