'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

import { GanttChart } from '../../components/GanttChart';
import { ListView } from '../../components/ListView';
import { CalendarView } from '../../components/CalendarView';
import { TaskFilters } from '../../components/TaskFilters';
import { Kanban } from '../../components/Kanban';
import { Button, ButtonLink, SectionLabel, ErrorAlert } from '../components';
import type { Task } from '../../types/task';
import { useTaskFilter } from '../../hooks/useTaskFilter';
import {
  getTeamTasks,
  updateTaskStatus,
  getTeamUsers,
  getTeamInvites,
  createTeamInvite,
  type TeamUserResponse,
  type TeamInviteResponse,
} from '@/services/teamService';
import { teamsPageBackground, cardStyles, layoutStyles } from '@/styles/teams';
import {
  TASK_STATUS,
  canTransitionTo,
  STATUS_TO_COLUMN,
  type ColumnKey,
  type TaskStatusKey,
} from '../../config/taskStatusConfig';

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

// 권한에 따른 배지 스타일 정의
function getRoleBadge(role: string | null | undefined) {
  const roleUpper = (role || 'MEMBER').trim().toUpperCase();
  if (roleUpper === 'MASTER') {
    return {
      label: '마스터',
      className:
        'rounded-full bg-gradient-to-r from-yellow-500/20 to-orange-500/20 px-2 py-0.5 text-xs font-semibold text-yellow-400 border border-yellow-500/30',
    };
  } else if (roleUpper === 'MANAGER') {
    return {
      label: '매니저',
      className:
        'rounded-full bg-gradient-to-r from-blue-500/20 to-indigo-500/20 px-2 py-0.5 text-xs font-semibold text-blue-400 border border-blue-500/30',
    };
  } else {
    return {
      label: '멤버',
      className:
        'rounded-full bg-gradient-to-r from-slate-500/20 to-slate-600/20 px-2 py-0.5 text-xs font-semibold text-slate-400 border border-slate-500/30',
    };
  }
}

// 날짜 포맷 헬퍼 함수
function formatMemberDate(date: Date) {
  return new Date(date).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

type ViewMode = 'kanban' | 'gantt' | 'list' | 'calendar';
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
  const [invites, setInvites] = useState<TeamInviteResponse[]>([]);
  const [isTeamManagementOpen, setIsTeamManagementOpen] = useState(false);
  const [teamManagementTab, setTeamManagementTab] = useState<'members' | 'stats' | 'invites'>('stats');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [createdInviteLink, setCreatedInviteLink] = useState<string | null>(null);

  // viewMode는 URL 쿼리에서 파생
  const viewMode = getViewModeFromQuery();

  // viewMode 변경 시 URL 업데이트
  const setViewMode = useCallback((mode: ViewMode) => {
    const params = new URLSearchParams(searchParams.toString());
    if (mode === 'kanban') {
      params.delete('view'); // 기본값은 쿼리에서 제거
    } else {
      params.set('view', mode);
    }
    const queryString = params.toString();
    router.push(`${pathname}${queryString ? `?${queryString}` : ''}`, { scroll: false });
  }, [router, pathname, searchParams]);

  useEffect(() => {
    if (!session?.user?.accessToken) {
      setError('인증이 필요합니다. 다시 로그인해주세요.');
      setIsLoading(false);
      return;
    }

    const fetchTeamTasks = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const teamIdNum = parseInt(teamId, 10);
        if (isNaN(teamIdNum)) {
          throw new Error('유효하지 않은 팀 ID입니다.');
        }

        const response = await getTeamTasks(teamIdNum, session.user.accessToken);
        setTeamName(response.data.team.teamName);
        setTeamDescription(response.data.team.teamDescription || '');

        // 마스터 판별(단순): 팀 리더(leaderId) === 현재 로그인 사용자(userId)
        const currentUserId = session.user.userId;
        const isMasterUser = Boolean(currentUserId && response.data.team.leaderId === currentUserId);

        // 팀 멤버 목록 조회(표시 목적)
        try {
          const membersResponse = await getTeamUsers(teamIdNum, session.user.accessToken);
          setMembers(membersResponse.data);

          // 멤버 목록 로드 후 현재 사용자의 권한 확인
          const currentUserMember = membersResponse.data.find(m => m.userId === currentUserId);
          const userRole = currentUserMember?.role?.toUpperCase().trim();
          const canInvite = userRole === 'MASTER' || userRole === 'MANAGER';
          setCanManageInvites(canInvite);

          // 권한이 있는 경우 초대 링크 목록 조회
          if (canInvite) {
            try {
              const invitesResponse = await getTeamInvites(teamIdNum, session.user.accessToken);
              setInvites(invitesResponse.data);
            } catch (inviteErr) {
              // 403 에러는 백엔드 권한 체크로 인한 것이므로 조용히 처리
              const errorMessage = inviteErr instanceof Error ? inviteErr.message : String(inviteErr);
              if (errorMessage.includes('권한이 없습니다') || errorMessage.includes('403')) {
                console.warn('팀 초대 링크 조회 권한이 없습니다. 백엔드 권한 설정을 확인해주세요.');
                setInvites([]);
                // 권한이 실제로 없는 경우 canManageInvites를 false로 설정
                setCanManageInvites(false);
              } else {
                console.error('Failed to fetch team invites:', inviteErr);
                setInvites([]);
              }
            }
          } else {
            setInvites([]);
          }
        } catch (memberErr) {
          console.error('Failed to fetch team members:', memberErr);
          // 멤버 목록 조회 실패 시 기존 로직 유지 (leaderId 기반)
          setCanManageInvites(isMasterUser);
          if (isMasterUser) {
            try {
              const invitesResponse = await getTeamInvites(teamIdNum, session.user.accessToken);
              setInvites(invitesResponse.data);
            } catch (inviteErr) {
              const errorMessage = inviteErr instanceof Error ? inviteErr.message : String(inviteErr);
              if (errorMessage.includes('권한이 없습니다') || errorMessage.includes('403')) {
                console.warn('팀 초대 링크 조회 권한이 없습니다.');
                setInvites([]);
                setCanManageInvites(false);
              } else {
                console.error('Failed to fetch team invites:', inviteErr);
                setInvites([]);
              }
            }
          } else {
            setInvites([]);
          }
        }

        // taskStatus에 따라 태스크를 컬럼별로 분류
        const classifiedTasks: Record<ColumnKey, Task[]> = {
          todo: [],
          inProgress: [],
          done: [],
          onHold: [],
          cancelled: [],
        };

        response.data.tasks.forEach(task => {
          // actStatus가 1(ACTIVE)인 태스크만 표시
          if (task.actStatus === 1) {
            const columnKey = taskStatusToColumn[task.taskStatus] || 'todo';
            classifiedTasks[columnKey].push(task);
          }
        });

        setTasks(classifiedTasks);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '태스크 목록을 불러오는데 실패했습니다.';
        setError(errorMessage);
        console.error('Failed to fetch team tasks:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTeamTasks();
  }, [teamId, session?.user?.accessToken, session?.user?.userId]);

  // 모든 태스크를 하나의 배열로 합침
  const allTasks = useMemo(
    () => [...tasks.todo, ...tasks.inProgress, ...tasks.done, ...tasks.onHold, ...tasks.cancelled],
    [tasks]
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

  // 필터된 태스크를 컬럼별로 분류 (칸반용)
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
  const statsCards = [
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
  ];

  // 상태 변경 함수 (버튼 클릭으로 상태 변경)
  const handleStatusChange = useCallback(async (taskId: number, newStatus: number) => {
    if (!session?.user?.accessToken) return;

    // 현재 태스크 찾기
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

    // 워크플로우 전이 검증
    const currentStatusKey = currentTask.taskStatus as TaskStatusKey;
    const newStatusKey = newStatus as TaskStatusKey;
    
    if (!canTransitionTo(currentStatusKey, newStatusKey)) {
      console.warn(`상태 전이 불가: ${currentStatusKey} → ${newStatusKey}`);
      setError(`${TASK_STATUS[currentStatusKey]?.label || currentStatusKey}에서 ${TASK_STATUS[newStatusKey]?.label || newStatusKey}(으)로 상태를 변경할 수 없습니다.`);
      return;
    }

    const newColumn = taskStatusToColumn[newStatus];
    if (!newColumn) {
      // 매핑되지 않은 상태의 경우 (예: 미래 확장을 위한 새로운 상태)
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
      
      if (currentColumn === newColumn) {
        return prev;
      }
      
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
    } catch (err) {
      // 실패 시 롤백
      console.error('Failed to update task status:', err);
      setError(err instanceof Error ? err.message : '태스크 상태 변경에 실패했습니다.');

      // 원래 상태로 복구
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
  }, [session?.user?.accessToken, tasks, teamId]);

  const handleCreateInvite = async (expiresInDays: number, usageMaxCnt?: number) => {
    if (!session?.user?.accessToken) return;

    setIsCreatingInvite(true);
    setError(null);
    try {
      const teamIdNum = parseInt(teamId, 10);
      if (isNaN(teamIdNum)) {
        throw new Error('유효하지 않은 팀 ID입니다.');
      }

      // 만료일은 항상 포함(1~3일, 일 단위)
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

      await createTeamInvite(teamIdNum, request, session.user.accessToken);

      // 성공 알림 표시
      alert('초대 링크가 성공적으로 생성되었습니다!');

      // 성공 시 모달 자동 종료 + 상태 초기화(다음 오픈 시 성공 화면 잔존 방지)
      setShowInviteModal(false);
      setCreatedInviteLink(null);

      // 초대 링크 목록 새로고침
      const invitesResponse = await getTeamInvites(teamIdNum, session.user.accessToken);
      setInvites(invitesResponse.data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '초대 링크 생성에 실패했습니다.';
      setError(errorMessage);
      console.error('Failed to create invite:', err);
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleCopyInviteLink = (link: string) => {
    navigator.clipboard.writeText(link).then(() => {
      // 복사 성공 피드백 (간단한 알림)
      alert('초대 링크가 클립보드에 복사되었습니다.');
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={layoutStyles.pageContainer} style={teamsPageBackground}>
      <main className={`${layoutStyles.mainContent} max-w-lg`}>
        <section className={`${cardStyles.section} p-4`}>
          <SectionLabel>Team Kanban</SectionLabel>
          <div className='mt-4 flex flex-col gap-4'>
            <div>
              <h1 className='text-3xl font-bold text-white'>
                {isLoading ? '로딩 중...' : teamName || ''}
              </h1>
              {teamDescription && <p className='mt-2 text-sm text-slate-400'>{teamDescription}</p>}
            </div>
            <div className='flex flex-col gap-2'>
              {canManageInvites && (
                <Button
                  variant='secondary'
                  size='lg'
                  fullWidth
                  onClick={() => setShowInviteModal(true)}
                >
                  팀 초대
                </Button>
              )}
              <ButtonLink
                href={`/teams/${teamId}/edit`}
                variant='secondary'
                size='lg'
                fullWidth
              >
                팀 수정
              </ButtonLink>
              <ButtonLink
                href={`/teams/${teamId}/tasks/new`}
                size='lg'
                fullWidth
              >
                새 카드 작성
              </ButtonLink>
            </div>
          </div>
        </section>

        {/* 팀 관리 (멤버 + 초대 링크) */}
        {(() => {
          // 탭 설정 객체 (아이콘, 라벨, 카운트 통합 관리)
          const teamManagementTabsConfig = [
            {
              key: 'members' as const,
              label: '멤버',
              iconPath: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
              count: members.length,
              visible: true,
            },
            {
              key: 'stats' as const,
              label: '통계',
              iconPath: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
              count: null,
              visible: true,
            },
            {
              key: 'invites' as const,
              label: '초대',
              iconPath: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
              count: invites.length,
              visible: canManageInvites,
            },
          ];

          const visibleTabs = teamManagementTabsConfig.filter(tab => tab.visible);

          return (
            <section className={`${cardStyles.section} p-4`}>
              {/* 컴팩트 헤더 */}
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-3'>
                  <SectionLabel>Team Management</SectionLabel>
                  <div className='flex items-center gap-2'>
                    {visibleTabs.map(tab => (
                      <span key={tab.key} className='flex items-center gap-1 text-xs text-slate-500' title={tab.label}>
                        <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d={tab.iconPath} />
                        </svg>
                        {tab.count !== null && tab.count}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setIsTeamManagementOpen(v => !v)}
                  className='p-2 rounded-lg hover:bg-white/5 transition text-slate-400 hover:text-slate-300'
                  aria-label={isTeamManagementOpen ? '접기' : '펼치기'}
                >
                  {isTeamManagementOpen ? (
                    <svg className='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 15l7-7 7 7' />
                    </svg>
                  ) : (
                    <svg className='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 9l-7 7-7-7' />
                    </svg>
                  )}
                </button>
              </div>

              {/* 펼쳐진 상태일 때만 표시 */}
              {isTeamManagementOpen && (
                <>
                  {/* 탭 버튼 (아이콘 형태) */}
                  <div className='mt-4 flex gap-1 rounded-xl border border-white/10 bg-slate-900/30 p-1'>
                    {visibleTabs.map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setTeamManagementTab(tab.key)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                          teamManagementTab === tab.key
                            ? 'bg-gradient-to-r from-indigo-500/20 to-sky-500/20 text-white border border-white/10'
                            : 'text-slate-400 hover:text-slate-300'
                        }`}
                        title={tab.label}
                      >
                        <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d={tab.iconPath} />
                        </svg>
                        {tab.count !== null && <span>{tab.count}</span>}
                      </button>
                    ))}
                  </div>

              {/* 멤버 탭 내용 */}
              {teamManagementTab === 'members' && (
                <div className='mt-4'>
                  {members.length === 0 ? (
                    <div className='rounded-2xl border border-dashed border-white/20 px-6 py-10 text-center text-slate-400'>
                      멤버 정보를 불러오는 중...
                    </div>
                  ) : (
                    <div className='grid grid-cols-1 gap-3'>
                      {members.map(member => {
                        const isCurrentUser = session?.user?.userId === member.userId;
                        const roleBadge = getRoleBadge(member.role);

                        return (
                          <div
                            key={member.userId}
                            className='rounded-2xl border border-white/10 bg-slate-950/30 p-4'
                          >
                            <div className='flex items-center justify-between'>
                              <div className='flex-1'>
                                <div className='flex items-center gap-2 flex-wrap'>
                                  <p className='text-lg font-semibold text-white'>
                                    {member.userName || `사용자 ${member.userId}`}
                                  </p>
                                  <span className={roleBadge.className}>{roleBadge.label}</span>
                                  {isCurrentUser && (
                                    <span className='rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 px-2 py-0.5 text-xs font-semibold text-purple-400 border border-purple-500/30'>
                                      나
                                    </span>
                                  )}
                                </div>
                                <p className='mt-2 text-xs text-slate-500'>
                                  가입일: {formatMemberDate(member.joinedAt)}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 통계 탭 내용 */}
              {teamManagementTab === 'stats' && (
                <div className='mt-4'>
                  <div className='grid grid-cols-2 gap-3'>
                    {statsCards.map(stat => (
                      <div
                        key={stat.label}
                        className={`rounded-2xl border p-3 ${
                          stat.alert
                            ? 'border-red-500/30 bg-red-500/10'
                            : stat.warning
                              ? 'border-orange-500/30 bg-orange-500/10'
                              : 'border-white/10 bg-slate-950/30'
                        }`}
                      >
                        <SectionLabel spacing='tight' color='subtle'>{stat.label}</SectionLabel>
                        <p className={`mt-3 text-3xl font-bold ${
                          stat.alert ? 'text-red-400' : stat.warning ? 'text-orange-400' : 'text-white'
                        }`}>
                          {stat.value}
                        </p>
                        <p className='mt-1 text-sm text-slate-500'>{stat.helper}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 초대 링크 탭 내용 (권한 체크) */}
              {teamManagementTab === 'invites' && canManageInvites && (
                <div className='mt-4'>
                  {invites.length === 0 ? (
                    <div className='rounded-2xl border border-dashed border-white/20 px-6 py-10 text-center text-slate-400'>
                      생성된 초대 링크가 없습니다.
                    </div>
                  ) : (
                    <div className='grid gap-4'>
                      {invites.map(invite => {
                        const isExpired = new Date(invite.endAt) < new Date();
                        const isMaxReached = invite.usageCurCnt >= invite.usageMaxCnt;
                        const isActive = invite.actStatus === 1 && !isExpired && !isMaxReached;

                        // 초대 링크 URL 생성 (프론트엔드 URL + 토큰)
                        const inviteUrl = `${
                          typeof window !== 'undefined' ? window.location.origin : ''
                        }/teams/invite/accept?token=${encodeURIComponent(invite.token)}`;

                        return (
                          <div
                            key={invite.invId}
                            className={`rounded-2xl border p-4 ${
                              isActive
                                ? 'border-white/10 bg-slate-950/30'
                                : 'border-slate-700/50 bg-slate-950/10 opacity-60'
                            }`}
                          >
                            <div className='flex flex-col gap-3'>
                              <div>
                                <div className='mb-2 flex items-center gap-2'>
                                  <p className='text-sm font-semibold text-slate-300'>
                                    초대 링크 #{invite.invId}
                                  </p>
                                  {isActive ? (
                                    <span className='rounded-full border border-green-500/30 bg-green-500/20 px-2 py-0.5 text-xs font-semibold text-green-400'>
                                      활성
                                    </span>
                                  ) : (
                                    <span className='rounded-full border border-slate-500/30 bg-slate-500/20 px-2 py-0.5 text-xs font-semibold text-slate-400'>
                                      비활성
                                    </span>
                                  )}
                                </div>
                                <div className='space-y-1 text-sm text-slate-400'>
                                  <p>
                                    사용 횟수: {invite.usageCurCnt} / {invite.usageMaxCnt}
                                  </p>
                                  <p>만료일: {formatDate(invite.endAt)}</p>
                                  <p>생성일: {formatDate(invite.crtdAt)}</p>
                                </div>
                                {isActive && (
                                  <div className='mt-3 rounded-lg border border-white/5 bg-slate-900/50 p-3'>
                                    <p className='mb-1 text-xs text-slate-500'>초대 링크:</p>
                                    <p className='break-all font-mono text-xs text-slate-300'>{inviteUrl}</p>
                                  </div>
                                )}
                              </div>
                              {isActive && (
                                <button
                                  onClick={() => handleCopyInviteLink(inviteUrl)}
                                  className='w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-white/40 hover:bg-white/10'
                                >
                                  링크 복사
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
                </>
              )}
            </section>
          );
        })()}

        {error && (
          <ErrorAlert message={error} className='text-center' />
        )}

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
          <div className='text-xs text-slate-500 mt-2'>
            {filteredTasks.length}개 태스크 표시 중 (전체 {allTasks.length}개)
          </div>
        )}

        {/* 보기 전환 버튼 (아이콘 세그먼트 컨트롤) */}
        <div className='flex justify-end mb-4'>
          <div className='flex rounded-xl border border-white/10 bg-slate-900/30 p-1'>
            <button
              onClick={() => setViewMode('kanban')}
              title='칸반 보드'
              className={`p-2.5 rounded-lg transition ${
                viewMode === 'kanban'
                  ? 'bg-gradient-to-r from-indigo-500/20 to-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
              }`}
            >
              <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2' />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('gantt')}
              title='타임라인'
              className={`p-2.5 rounded-lg transition ${
                viewMode === 'gantt'
                  ? 'bg-gradient-to-r from-indigo-500/20 to-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
              }`}
            >
              <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 6h16M4 10h16M4 14h16M4 18h16' />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              title='리스트'
              className={`p-2.5 rounded-lg transition ${
                viewMode === 'list'
                  ? 'bg-gradient-to-r from-indigo-500/20 to-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
              }`}
            >
              <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 6h16M4 12h16M4 18h16' />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              title='캘린더'
              className={`p-2.5 rounded-lg transition ${
                viewMode === 'calendar'
                  ? 'bg-gradient-to-r from-indigo-500/20 to-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
              }`}
            >
              <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' />
              </svg>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className={`${cardStyles.section} p-8 text-center text-slate-400`}>
            태스크 목록을 불러오는 중...
          </div>
        ) : viewMode === 'kanban' ? (
          <Kanban
            tasksByColumn={filteredTasksByColumn}
            onStatusChange={handleStatusChange}
            teamId={teamId}
          />
        ) : viewMode === 'gantt' ? (
          <GanttChart
            tasks={filteredTasks}
            teamId={teamId}
          />
        ) : viewMode === 'list' ? (
          <ListView
            tasks={filteredTasks}
            teamId={teamId}
          />
        ) : (
          <CalendarView
            tasks={filteredTasks}
            teamId={teamId}
          />
        )}
      </main>

      {/* 초대 링크 생성 모달 */}
      {showInviteModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4'>
          <div className='relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-4'>
            <button
              onClick={() => {
                setShowInviteModal(false);
                setCreatedInviteLink(null);
              }}
              className='absolute right-4 top-4 text-slate-400 hover:text-slate-200'
            >
              ✕
            </button>

            <h3 className='mb-4 text-xl font-bold text-white'>초대 링크 생성</h3>

            {createdInviteLink ? (
              <div>
                <p className='mb-4 text-sm text-slate-400'>초대 링크가 생성되었습니다!</p>
                <div className='mb-4 rounded-lg bg-slate-950/50 border border-white/5 p-3'>
                  <p className='mb-2 text-xs text-slate-500'>초대 링크:</p>
                  <p className='break-all text-xs text-slate-300 font-mono'>{createdInviteLink}</p>
                </div>
                <button
                  onClick={() => handleCopyInviteLink(createdInviteLink)}
                  className='w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-white/40 hover:bg-white/10'
                >
                  링크 복사
                </button>
                <button
                  onClick={() => {
                    setShowInviteModal(false);
                    setCreatedInviteLink(null);
                  }}
                  className='mt-3 w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-white/40 hover:bg-white/10'
                >
                  닫기
                </button>
              </div>
            ) : (
              <InviteCreateForm
                onSubmit={handleCreateInvite}
                isSubmitting={isCreatingInvite}
                onCancel={() => setShowInviteModal(false)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// 초대 링크 생성 폼 컴포넌트
function InviteCreateForm({
  onSubmit,
  isSubmitting,
  onCancel,
}: {
  onSubmit: (expiresInDays: number, usageMaxCnt?: number) => void;
  isSubmitting: boolean;
  onCancel: () => void;
}) {
  const [expiresInDays, setExpiresInDays] = useState<number>(3);
  const [usageMaxCnt, setUsageMaxCnt] = useState<number | ''>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const usageMaxCntValue = usageMaxCnt === '' ? undefined : Number(usageMaxCnt);
    onSubmit(expiresInDays, usageMaxCntValue);
  };

  return (
    <form onSubmit={handleSubmit} className='space-y-3'>
      <div>
        <label className='mb-2 block text-xs font-semibold text-slate-300'>
          만료일 (최대 3일)
        </label>
        <select
          value={expiresInDays}
          onChange={e => setExpiresInDays(Number(e.target.value))}
          className='w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-slate-200 focus:border-white/20 focus:outline-none'
        >
          {Array.from({ length: 3 }, (_, i) => i + 1).map(days => (
            <option key={days} value={days}>
              {days}일 후 (23:59 만료)
            </option>
          ))}
        </select>
        <p className='mt-1 text-xs text-slate-500'>일 단위로만 선택할 수 있어요. (1~3일)</p>
      </div>

      <div>
        <label className='mb-2 block text-xs font-semibold text-slate-300'>
          최대 사용 횟수 (선택사항)
        </label>
        <input
          type='number'
          value={usageMaxCnt}
          onChange={e => setUsageMaxCnt(e.target.value === '' ? '' : Number(e.target.value))}
          min={1}
          className='w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-slate-200 focus:border-white/20 focus:outline-none'
          placeholder='최대 사용 횟수'
        />
        <p className='mt-1 text-xs text-slate-500'>최대 사용 횟수를 지정하지 않으면 기본값이 적용됩니다.</p>
      </div>

      <div className='flex gap-2 pt-3'>
        <button
          type='submit'
          disabled={isSubmitting}
          className='flex-1 rounded-lg bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:brightness-110 disabled:opacity-50'
        >
          {isSubmitting ? '생성 중...' : '생성하기'}
        </button>
        <button
          type='button'
          onClick={onCancel}
          disabled={isSubmitting}
          className='flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-white/40 hover:bg-white/10 disabled:opacity-50'
        >
          취소
        </button>
      </div>
    </form>
  );
}
