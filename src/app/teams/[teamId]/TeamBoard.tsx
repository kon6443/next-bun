'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

import { GanttChart } from '../../components/GanttChart';
import { ListView } from '../../components/ListView';
import { CalendarView } from '../../components/CalendarView';
import { TaskFilters } from '../../components/TaskFilters';
import { Kanban } from '../../components/Kanban';
import { TeamsPageLayout, SectionLabel, Button, ButtonLink, KanbanBoardSkeleton, ListViewSkeleton, CalendarViewSkeleton, GanttViewSkeleton, Skeleton, FAB, IconButton } from '../components';
import { EditIcon, UserGroupIcon, PlusIcon, QuestionMarkIcon, CommentIcon, TagIcon } from '../../components/Icons';
import { DropdownMenu } from './components/DropdownMenu';
import type { Task } from '../../types/task';
import { useTaskFilter, useTelegramLink, useDiscordLink, useTeamInvite, useTeamSocketEvents, useSafeNavigation, useLatestFlag } from '../../hooks';
import { useTeamSocketContext, useTeamChatContext, useTeamTagsContext } from './contexts';
import {
  getTeamTasks,
  updateTaskStatus,
  updateTaskActiveStatus,
  getTeamUsers,
  updateMemberRole,
  updateMemberStatus,
  type TeamUserResponse,
} from '@/services/teamService';
import { cardStyles } from '@/styles/teams';
import { loadBoardState, saveBoardState, consumeBoardReturn, parseDataTabParam, VIEW_MODES, type ListSort } from '../../utils/boardStateStorage';
import { shouldInsertCreatedTask } from '../../utils/taskUtils';
import { normalizeTaskTags } from '../../utils/tagUtils';
import { extractErrorMessage } from '../../utils/errorUtils';
import { STATUS_TO_COLUMN, type ColumnKey } from '../../config/taskStatusConfig';
import { TeamManagementSection, InviteModal, RoleChangeModal, ViewModeToggle, OnlineUsers, TutorialGuide, shouldAutoShowTutorial, markTutorialSeen, TeamChatPanel, TagModal, BoardLoadError, type ViewMode, type DataTab } from './components';
import { ROLES } from '../../config/roleConfig';
import type {
  TaskCreatedPayload,
  TaskUpdatedPayload,
  TaskStatusChangedPayload,
  TaskActiveStatusChangedPayload,
  UserJoinedPayload,
  UserLeftPayload,
  MemberRoleChangedPayload,
  MemberStatusChangedPayload,
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

export default function TeamBoard({ teamId }: TeamBoardProps) {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const { searchParams, pathname, getParam } = useSafeNavigation();

  // URL 쿼리에서 viewMode 읽기
  const getViewModeFromQuery = useCallback((): ViewMode => {
    const viewParam = getParam('view');
    if (viewParam && VIEW_MODES.includes(viewParam as ViewMode)) {
      return viewParam as ViewMode;
    }
    return 'kanban';
  }, [getParam]);

  const teamIdNum = parseInt(teamId, 10);

  const [tasks, setTasks] = useState<Record<ColumnKey, Task[]>>({
    todo: [],
    inProgress: [],
    done: [],
    onHold: [],
    cancelled: [],
  });
  // 소켓 핸들러가 최신 목록으로 중복 여부를 판단하도록 (핸들러 재생성 없이)
  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);
  const [teamName, setTeamName] = useState<string>('');
  const [teamDescription, setTeamDescription] = useState<string>('');
  const [members, setMembers] = useState<TeamUserResponse[]>([]);
  // 초기 로딩(스켈레톤)과 탭 재조회(흐림)는 표시마다 순번을 따로 둔다 — 겹쳐도 서로의 표시를 끄지 못하는 일이 없게
  const [isLoading, trackInitialLoad, setIsLoading] = useLatestFlag(true);
  const [error, setError] = useState<string | null>(null);
  /** 초기 조회 다시 시도 횟수 — 늘리면 초기 로딩 effect가 다시 돈다 */
  const [reloadAttempt, setReloadAttempt] = useState(0);
  const [canManageInvites, setCanManageInvites] = useState(false);

  // 역할 변경 모달 상태
  const [showRoleChangeModal, setShowRoleChangeModal] = useState(false);
  const [roleChangeTarget, setRoleChangeTarget] = useState<TeamUserResponse | null>(null);
  const [isChangingRole, setIsChangingRole] = useState(false);

  // 멤버 상태 토글 상태
  const [togglingMemberIds, setTogglingMemberIds] = useState<number[]>([]);

  // 온라인 유저 모달 상태 (FAB 숨김용)
  const [isOnlineModalOpen, setIsOnlineModalOpen] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);

  // 데이터 탭: 활성 / 보관함 — 보기 방식처럼 URL(`?tab=archive`)에서 파생해 새로고침·공유 링크에서도 유지한다
  const dataTab = parseDataTabParam(getParam('tab'));
  const setDataTab = useCallback(
    (tab: DataTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === 'archive') {
        params.set('tab', 'archive');
      } else {
        params.delete('tab');
      }
      const queryString = params.toString();
      // 보기 방식 전환과 같이 push — 뒤로가기로 이전 탭으로 돌아간다 (D-F-Q1)
      router.push(`${pathname}${queryString ? `?${queryString}` : ''}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );
  // 목록에 지금 표시 중인 태스크가 어느 탭의 것인지 — 탭 전환 재조회 동안 이전 목록을 유지하므로
  // 보관/복원 버튼 등은 URL 탭이 아니라 이 값을 따른다
  const [tasksTab, setTasksTab] = useState<DataTab>(dataTab);
  const dataTabRef = useRef(dataTab);
  useEffect(() => {
    dataTabRef.current = dataTab;
  }, [dataTab]);
  // 탭 전환 재조회 중 (뷰를 언마운트하지 않고 흐리게 표시)
  const [isTabRefetching, trackTabRefetch] = useLatestFlag(false);
  // 상세 왕복·보기 전환 사이에도 유지할 캘린더 달·리스트 정렬
  const [calendarMonth, setCalendarMonth] = useState<string | undefined>(undefined);
  const [listSort, setListSort] = useState<ListSort | undefined>(undefined);

  // 보드 상태 복원 (sessionStorage) — 복원이 끝나야 첫 조회를 시작해 저장된 탭으로 한 번만 불러온다
  const [isBoardStateRestored, setIsBoardStateRestored] = useState(false);
  const [kanbanColumnIndex, setKanbanColumnIndex] = useState(0);
  const pendingScrollYRef = useRef<number | null>(null);
  // 상세에서 돌아온 진입인지 (팀별 1회 판정)
  const returningRef = useRef<{ teamId: string; returning: boolean } | null>(null);
  // 스크롤을 저장할 때의 보기 — 다른 보기로 들어오면 그 위치는 의미가 없어 복원하지 않는다
  const pendingScrollViewRef = useRef<ViewMode | undefined>(undefined);
  const isScrollTrackingRef = useRef(false);
  // 마지막으로 조회를 시작한 데이터 탭 — 첫 조회와 탭 전환 조회가 겹치지 않게 한다
  const fetchedTabRef = useRef<DataTab | null>(null);

  // 튜토리얼 가이드 상태
  const [showTutorial, setShowTutorial] = useState(false);

  // 커스텀 훅으로 분리된 로직
  const {
    telegramStatus,
    isLoading: isLoadingTelegram,
    isCreating: isCreatingTelegramLink,
    isDeleting: isDeletingTelegramLink,
    showDeleteConfirm: showTelegramDeleteConfirm,
    handleCreateLink: handleCreateTelegramLink,
    requestDeleteLink: requestDeleteTelegramLink,
    confirmDeleteLink: confirmDeleteTelegramLink,
    cancelDeleteLink: cancelDeleteTelegramLink,
    handleRefreshStatus: handleRefreshTelegramStatus,
  } = useTelegramLink(teamIdNum, session?.user?.accessToken);

  const {
    discordStatus,
    isLoading: isLoadingDiscord,
    isSaving: isSavingDiscordWebhook,
    isDeleting: isDeletingDiscordWebhook,
    showDeleteConfirm: showDiscordDeleteConfirm,
    handleSaveWebhook: handleSaveDiscordWebhook,
    requestDeleteWebhook: requestDeleteDiscordWebhook,
    confirmDeleteWebhook: confirmDeleteDiscordWebhook,
    cancelDeleteWebhook: cancelDeleteDiscordWebhook,
    handleRefreshStatus: handleRefreshDiscordStatus,
  } = useDiscordLink(teamIdNum, session?.user?.accessToken);

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

  // 로컬 상태에서 태스크 제거 (보관/복원/소켓 이벤트 공통)
  const removeTaskFromLocal = useCallback((taskId: number) => {
    setTasks(prev => {
      const newTasks = { ...prev };
      for (const columnKey of Object.keys(newTasks) as ColumnKey[]) {
        newTasks[columnKey] = newTasks[columnKey].filter(t => t.taskId !== taskId);
      }
      return newTasks;
    });
  }, []);

  // 태스크 분류 공통 함수
  const classifyTasks = useCallback((taskList: Task[]) => {
    const classified: Record<ColumnKey, Task[]> = {
      todo: [], inProgress: [], done: [], onHold: [], cancelled: [],
    };
    taskList.forEach(task => {
      const columnKey = taskStatusToColumn[task.taskStatus] || 'todo';
      classified[columnKey].push(task);
    });
    return classified;
  }, []);

  // 태스크 조회 순번 — 더 늦게 시작한 조회가 있으면 먼저 시작한 조회의 응답은 목록에 반영하지 않는다
  // (탭 연타, 첫 조회와 탭 전환 조회가 겹칠 때 늦게 온 이전 탭 응답이 덮어쓰는 것을 막는다)
  const taskFetchSeqRef = useRef(0);
  useEffect(() => () => {
    // 팀이 바뀌거나 언마운트되면 진행 중인 응답을 모두 버린다
    taskFetchSeqRef.current += 1;
  }, [teamIdNum]);

  // 태스크 목록 조회 (현재 탭 API 1회만 호출)
  const fetchAndSetTasks = useCallback(async (accessToken: string, tab: DataTab) => {
    const seq = ++taskFetchSeqRef.current;
    const actStatusParam = tab === 'archive' ? 0 : 1;
    const tasksResponse = await getTeamTasks(teamIdNum, accessToken, actStatusParam);
    if (seq === taskFetchSeqRef.current) {
      setTasks(classifyTasks(tasksResponse.data.tasks));
      setTasksTab(tab);
    }
    return tasksResponse;
  }, [teamIdNum, classifyTasks]);

  // ===== WebSocket (Context에서 관리) =====
  const { socket, onlineUsers, roomJoinCount } = useTeamSocketContext();
  const { isChatOpen, openChat, closeChat, myUnreadCount } = useTeamChatContext();

  // 채팅 상태는 레이아웃에 있으므로, 보드를 떠나면 패널을 닫는다 (안 보이는 채팅이 계속 읽음 처리되지 않도록)
  useEffect(() => closeChat, [closeChat]);

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
        completedAt: null,
        crtdBy: payload.createdBy,
        crtdAt: new Date(),
        userName,
        tags: normalizeTaskTags(payload.tags),
      };

      const alreadyExists = Object.values(tasksRef.current).some(column =>
        column.some(t => t.taskId === payload.taskId),
      );
      // 탭 전환 재조회 중에는 화면에 남아 있는 목록(tasksTab) 기준으로 판단한다 — 재조회 결과가 곧 덮어쓴다
      if (!shouldInsertCreatedTask(payload.actStatus, tasksTab, alreadyExists)) return;

      setTasks(prev => {
        if (prev[columnKey].some(t => t.taskId === payload.taskId)) return prev;
        return { ...prev, [columnKey]: [...prev[columnKey], newTask] };
      });
      toast.success('새 태스크가 추가되었습니다.');
    },
    [members, tasksTab],
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
                  ...(payload.tags !== undefined && { tags: payload.tags }),
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

      const completedAt = payload.completedAt ? new Date(payload.completedAt) : null;

      // 같은 컬럼 내 이동이면 상태값만 업데이트
      if (sourceColumnKey === newColumnKey) {
        return {
          ...prev,
          [sourceColumnKey]: prev[sourceColumnKey].map(task =>
            task.taskId === payload.taskId
              ? { ...task, taskStatus: payload.newStatus, completedAt }
              : task,
          ),
        };
      }

      // 다른 컬럼으로 이동: 불변성을 유지하며 업데이트
      const updatedTask = { ...movedTask, taskStatus: payload.newStatus, completedAt };

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

  // 연속 active-status 이벤트에 대한 리페치 debounce (서버 부하 방지)
  const activeStatusRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (activeStatusRefetchTimerRef.current) clearTimeout(activeStatusRefetchTimerRef.current);
  }, []);

  const handleSocketTaskActiveStatusChanged = useCallback(
    (payload: TaskActiveStatusChangedPayload) => {
      const currentTabActStatus = dataTab === 'active' ? 1 : 0;
      const nowMatchesCurrentTab = payload.newActStatus === currentTabActStatus;

      if (nowMatchesCurrentTab) {
        // 현재 탭에 새로 포함되어야 할 태스크: 전체 객체가 필요하므로 리페치 (debounce)
        if (activeStatusRefetchTimerRef.current) {
          clearTimeout(activeStatusRefetchTimerRef.current);
        }
        activeStatusRefetchTimerRef.current = setTimeout(() => {
          if (!session?.user?.accessToken) return;
          // 대기 중에 탭을 바꿨으면 바뀐 탭으로 — 이벤트 시점 탭으로 조회하면 최신 순번이 되어 URL 탭과 목록이 어긋난다
          fetchAndSetTasks(session.user.accessToken, dataTabRef.current).catch(err => {
            console.error('Failed to refresh tasks on active-status change:', err);
            toast.error('태스크 목록 갱신에 실패했습니다.');
          });
        }, 300);
      } else {
        // 현재 탭에서 벗어난 태스크: 로컬 제거
        removeTaskFromLocal(payload.taskId);
      }

      // 토스트 id 지정 → 연속 이벤트 시 스팸 없이 마지막 내용만 표시
      toast.success(
        payload.newActStatus === 0 ? '태스크가 보관되었습니다.' : '태스크가 복원되었습니다.',
        { id: 'task-active-status' },
      );
    },
    [dataTab, removeTaskFromLocal, session?.user?.accessToken, fetchAndSetTasks],
  );

  // 온라인 유저 접속 이벤트 (토스트 알림만 - 상태는 Context에서 관리)
  const handleUserJoined = useCallback((payload: UserJoinedPayload) => {
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

  // 온라인 유저 퇴장 이벤트 (토스트 알림만 - 상태는 Context에서 관리)
  const handleUserLeft = useCallback((payload: UserLeftPayload) => {
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

  // 멤버 상태 변경 이벤트 (토스트 없이 상태만 업데이트)
  const handleMemberStatusChanged = useCallback((payload: MemberStatusChangedPayload) => {
    // 멤버 목록에서 해당 유저의 상태 업데이트
    setMembers(prev => 
      prev.map(member => 
        member.userId === payload.userId
          ? { ...member, userActStatus: payload.newStatus as 0 | 1 }
          : member
      )
    );
  }, []);

  // Socket 이벤트 리스너 등록 (온라인 유저 상태는 Context에서 관리, 여기서는 토스트 등 UI만 처리)
  useTeamSocketEvents(
    socket,
    {
      onTaskCreated: handleSocketTaskCreated,
      onTaskUpdated: handleSocketTaskUpdated,
      onTaskStatusChanged: handleSocketTaskStatusChanged,
      onTaskActiveStatusChanged: handleSocketTaskActiveStatusChanged,
      onUserJoined: handleUserJoined,
      onUserLeft: handleUserLeft,
      onMemberRoleChanged: handleMemberRoleChanged,
      onMemberStatusChanged: handleMemberStatusChanged,
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

  // fetchInvites를 ref로 관리하여 useEffect 의존성에서 제외
  const fetchInvitesRef = useRef(fetchInvites);

  useEffect(() => {
    fetchInvitesRef.current = fetchInvites;
  }, [fetchInvites]);

  // 초기 로딩: 팀 정보 + 멤버 + 통합 + 태스크 (페이지 진입 시 1회)
  useEffect(() => {
    if (!isBoardStateRestored) return;
    if (sessionStatus === 'loading') return;

    if (!session?.user?.accessToken) {
      setError('인증이 필요합니다. 다시 로그인해주세요.');
      setIsLoading(false);
      return;
    }

    // 데이터 탭은 의존성에서 뺀다 — 탭 전환은 아래 별도 effect가 태스크만 재조회한다(멤버·초대까지 다시 부르지 않게)
    const tab = dataTabRef.current;
    const fetchTeamData = async () => {
      fetchedTabRef.current = tab;
      setError(null);
      try {
        if (isNaN(teamIdNum)) {
          throw new Error('유효하지 않은 팀 ID입니다.');
        }

        const currentUserId = session.user.userId;

        // 연동 상태(텔레그램·디스코드)는 관리 탭을 처음 열 때 TeamManagementSection 이 조회한다
        const [tasksResponse, membersResult] = await Promise.all([
          fetchAndSetTasks(session.user.accessToken, tab),
          getTeamUsers(teamIdNum, session.user.accessToken).catch(err => {
            console.error('Failed to fetch team members:', err);
            return null;
          }),
        ]);

        setTeamName(tasksResponse.data.team.teamName);
        setTeamDescription(tasksResponse.data.team.teamDescription || '');

        const isMasterUser = Boolean(currentUserId && tasksResponse.data.team.leaderId === currentUserId);

        if (membersResult) {
          setMembers(membersResult.data);
          const currentUserMember = membersResult.data.find(m => m.userId === currentUserId);
          const userRole = currentUserMember?.role?.toUpperCase().trim();
          const canInvite = userRole === 'MASTER' || userRole === 'MANAGER';
          setCanManageInvites(canInvite);
          if (canInvite) await fetchInvitesRef.current();
        } else {
          setCanManageInvites(isMasterUser);
          if (isMasterUser) await fetchInvitesRef.current();
        }
      } catch (err) {
        const errorMessage = extractErrorMessage(err, '태스크 목록을 불러오는데 실패했습니다.');
        setError(errorMessage);
        console.error('Failed to fetch team data:', err);
      }
    };

    trackInitialLoad(fetchTeamData);
  }, [
    teamId,
    teamIdNum,
    session?.user?.accessToken,
    session?.user?.userId,
    sessionStatus,
    isBoardStateRestored,
    reloadAttempt,
    fetchAndSetTasks,
    setIsLoading,
    trackInitialLoad,
  ]);

  // 데이터 탭 전환 시 태스크만 재조회 (멤버/통합 재호출 불필요)
  useEffect(() => {
    if (!isBoardStateRestored) return;
    if (!session?.user?.accessToken || isNaN(teamIdNum)) return;
    // 위 첫 조회가 이미 이 탭으로 불러왔으면 스킵
    if (fetchedTabRef.current === dataTab) return;
    fetchedTabRef.current = dataTab;

    // 탭 전환은 스켈레톤으로 뷰를 갈아끼우지 않는다 — 캘린더 달·리스트 정렬·스크롤이 유지되게 기존 뷰를 흐리게 둔다
    const fetchTasksOnly = async () => {
      try {
        await fetchAndSetTasks(session.user.accessToken, dataTab);
      } catch (err) {
        console.error('Failed to fetch tasks:', err);
        toast.error('태스크 목록 조회에 실패했습니다.');
      }
    };

    trackTabRefetch(fetchTasksOnly);
  }, [dataTab, teamIdNum, session?.user?.accessToken, fetchAndSetTasks, isBoardStateRestored, trackTabRefetch]);

  // 소켓이 끊겼다 다시 방에 들어오면, 끊긴 동안 놓친 태스크 이벤트를 메우려 현재 탭을 조용히 재조회한다
  // (마운트 시점 이후의 재입장만 — 첫 입장은 위 초기 조회가 담당)
  const roomJoinBaselineRef = useRef(roomJoinCount);
  useEffect(() => {
    if (roomJoinCount <= Math.max(roomJoinBaselineRef.current, 1)) return;
    roomJoinBaselineRef.current = roomJoinCount;
    const accessToken = session?.user?.accessToken;
    if (!accessToken || !isBoardStateRestored) return;
    // 첫 조회가 실패해 오류 화면이면 태스크만이 아니라 팀 정보·멤버까지 처음부터 다시 부른다(성공하면 오류 화면이 걷힌다)
    if (error) {
      setReloadAttempt(n => n + 1);
      return;
    }
    fetchAndSetTasks(accessToken, dataTab).catch(err => {
      console.error('Failed to refresh tasks after reconnect:', err);
    });
  }, [roomJoinCount, session?.user?.accessToken, isBoardStateRestored, fetchAndSetTasks, dataTab, error]);

  // 모든 태스크를 하나의 배열로 합침
  const allTasks = useMemo(
    () => [...tasks.todo, ...tasks.inProgress, ...tasks.done, ...tasks.onHold, ...tasks.cancelled],
    [tasks],
  );

  const { tags: teamTags } = useTeamTagsContext();

  // 필터 훅 사용
  const {
    filters,
    setSearchQuery,
    setAssigneeId,
    setPeriod,
    setStatus,
    setTagIds,
    resetFilters,
    restoreFilters,
    filteredTasks,
    stats,
    assignees,
    hasActiveFilters,
  } = useTaskFilter(allTasks, teamTags);

  // 빈 보드·빈 컬럼에서 다음 행동
  // - 필터 때문에 비었으면 새 카드가 아니라 필터 초기화가 맞는 행동이다
  // - 보관함 탭에서는 새 카드가 들어가지 않으므로 띄우지 않는다
  const emptyAction = hasActiveFilters ? (
    <Button type="button" variant="secondary" onClick={resetFilters}>
      필터 초기화
    </Button>
  ) : tasksTab === 'active' ? (
    <ButtonLink href={`/teams/${teamId}/tasks/new`}>새 카드 작성</ButtonLink>
  ) : undefined;

  // 카드·행의 태그 칩을 누르면 그 태그로만 거른다
  const handleTagClick = useCallback((tagId: number) => setTagIds([tagId]), [setTagIds]);

  // 없는 태그(다른 팀원이 삭제·복원한 필터의 옛 ID)는 필터 선택에서 뺀다 — 남겨 두면 아무것도 안 보이는 필터가 걸린 채 남는다
  useEffect(() => {
    if (!teamTags) return;
    const existing = new Set(teamTags.map(tag => tag.tagId));
    if (filters.tagIds.some(id => !existing.has(id))) setTagIds(filters.tagIds.filter(id => existing.has(id)));
  }, [teamTags, filters.tagIds, setTagIds]);

  // 태스크 상세의 태그 칩에서 넘어온 태그 필터(?tag=) — 저장된 상태 복원 뒤에 적용하고 주소에서 지운다.
  // 주소에 남겨 두면 이후 필터를 바꾼 뒤 새로고침할 때 옛 태그가 다시 걸린다
  const tagParam = getParam('tag');
  useEffect(() => {
    if (!isBoardStateRestored || !tagParam) return;
    const tagId = Number(tagParam);
    if (Number.isInteger(tagId) && tagId > 0) setTagIds([tagId]);
    // 필터가 바뀐 화면이라 저장해 둔 옛 스크롤 위치로 튀지 않게 복원을 건너뛴다
    // (이 effect가 스크롤 복원 effect보다 먼저 선언돼 같은 커밋에서 먼저 돈다)
    pendingScrollYRef.current = null;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('tag');
    const queryString = params.toString();
    router.replace(`${pathname}${queryString ? `?${queryString}` : ''}`, { scroll: false });
  }, [isBoardStateRestored, tagParam, setTagIds, searchParams, pathname, router]);

  // 저장된 보드 상태 복원 (마운트 시 1회, 클라이언트에서만) — 상세에서 돌아온 진입일 때만 복원한다
  useEffect(() => {
    // 개발 모드에서 effect가 두 번 돌아도 첫 판정을 유지 (표시는 1회용이라 두 번째는 false)
    if (returningRef.current?.teamId !== teamId) {
      returningRef.current = { teamId, returning: consumeBoardReturn(teamId) };
    }
    const saved = returningRef.current.returning ? loadBoardState(teamId) : {};
    // 데이터 탭은 URL(?tab)이 들고 있으므로 복원하지 않는다 — 상세의 돌아가기 링크가 탭을 포함한다
    if (saved.filters) restoreFilters(saved.filters);
    if (saved.calendarMonth) setCalendarMonth(saved.calendarMonth);
    if (saved.listSort) setListSort(saved.listSort);
    if (saved.kanbanColumnIndex !== undefined) setKanbanColumnIndex(saved.kanbanColumnIndex);
    pendingScrollYRef.current = saved.scrollY ?? null;
    pendingScrollViewRef.current = saved.view;
    setIsBoardStateRestored(true);
  }, [teamId, restoreFilters]);

  // 첫 로딩이 끝나 콘텐츠 높이가 잡힌 뒤 스크롤 위치 복원, 이후부터 스크롤 저장 시작
  useEffect(() => {
    if (!isBoardStateRestored || isLoading || isScrollTrackingRef.current) return;
    const savedY = pendingScrollYRef.current;
    pendingScrollYRef.current = null;
    if (savedY !== null && pendingScrollViewRef.current === viewMode) {
      requestAnimationFrame(() => window.scrollTo(0, savedY));
    }
    isScrollTrackingRef.current = true;
  }, [isBoardStateRestored, isLoading, viewMode]);

  // 스크롤 위치 저장 (멈춘 뒤 한 번)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handleScroll = () => {
      if (!isScrollTrackingRef.current) return;
      clearTimeout(timer);
      timer = setTimeout(() => saveBoardState(teamId, { scrollY: Math.round(window.scrollY) }), 150);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [teamId]);

  // 탭·필터·보기·칸반 컬럼 저장 (복원이 끝난 뒤부터 — 복원 전 기본값으로 덮어쓰지 않게)
  useEffect(() => {
    if (!isBoardStateRestored) return;
    saveBoardState(teamId, {
      dataTab,
      filters,
      view: viewMode,
      kanbanColumnIndex,
      // undefined 도 그대로 넘긴다 — 병합 저장이라 키를 빼면 이전 왕복의 달·정렬이 남는다 (JSON 직렬화에서 지워진다)
      calendarMonth,
      listSort,
    });
  }, [teamId, isBoardStateRestored, dataTab, filters, viewMode, kanbanColumnIndex, calendarMonth, listSort]);

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

  // 멤버 상태 토글 처리
  const handleToggleMemberStatus = useCallback(
    async (member: TeamUserResponse, newStatus: 0 | 1) => {
      if (!session?.user?.accessToken) return;

      setTogglingMemberIds(prev => [...prev, member.userId]);
      try {
        await updateMemberStatus(
          teamIdNum,
          member.userId,
          { actStatus: newStatus },
          session.user.accessToken,
        );

        // API 성공 시 로컬 상태 업데이트
        setMembers(prev =>
          prev.map(m =>
            m.userId === member.userId
              ? { ...m, userActStatus: newStatus }
              : m
          )
        );

        toast.success(newStatus === 1 ? '멤버가 활성화되었습니다.' : '멤버가 비활성화되었습니다.');
      } catch (err) {
        console.error('Failed to toggle member status:', err);
        toast.error(err instanceof Error ? err.message : '상태 변경에 실패했습니다.');
      } finally {
        setTogglingMemberIds(prev => prev.filter(id => id !== member.userId));
      }
    },
    [session?.user?.accessToken, teamIdNum],
  );

  // 보관함에서 태스크 복원 (활성으로 전환)
  const handleRestore = useCallback(
    async (taskId: number) => {
      if (!session?.user?.accessToken) return;

      try {
        await updateTaskActiveStatus(teamIdNum, taskId, 1, session.user.accessToken);
        removeTaskFromLocal(taskId);
        toast.success('태스크가 활성으로 복원되었습니다.');
      } catch (err) {
        console.error('Failed to restore task:', err);
        toast.error(err instanceof Error ? err.message : '태스크 복원에 실패했습니다.');
      }
    },
    [session?.user?.accessToken, teamIdNum, removeTaskFromLocal],
  );

  // 활성 태스크를 보관함으로 이동
  const handleArchive = useCallback(
    async (taskId: number) => {
      if (!session?.user?.accessToken) return;

      try {
        await updateTaskActiveStatus(teamIdNum, taskId, 0, session.user.accessToken);
        removeTaskFromLocal(taskId);
        toast.success('보관함으로 이동되었습니다.');
      } catch (err) {
        console.error('Failed to archive task:', err);
        toast.error(err instanceof Error ? err.message : '보관함 이동에 실패했습니다.');
      }
    },
    [session?.user?.accessToken, teamIdNum, removeTaskFromLocal],
  );

  // 첫 방문 시 튜토리얼 자동 표시 (다른 대화상자가 열려 있으면 모두 닫힌 뒤에)
  const isOtherDialogOpen =
    isChatOpen ||
    showTagModal ||
    showInviteModal ||
    showRoleChangeModal ||
    isOnlineModalOpen ||
    showTelegramDeleteConfirm ||
    showDiscordDeleteConfirm;
  useEffect(() => {
    if (shouldAutoShowTutorial({ isLoading, hasError: Boolean(error), isOtherDialogOpen })) {
      setShowTutorial(true);
    }
  }, [isLoading, error, isOtherDialogOpen]);

  const handleCloseTutorial = useCallback(() => {
    setShowTutorial(false);
    markTutorialSeen();
  }, []);

  // 현재 사용자의 역할 가져오기
  const currentUserMember = members.find(m => m.userId === session?.user?.userId);
  const currentUserRole = currentUserMember?.role || 'MEMBER';

  return (
    <>
      <TeamsPageLayout hasFab>
        {/* 팀 헤더 섹션 */}
        <section className={`${cardStyles.section} p-4`}>
          <div className="flex items-center justify-between mb-4">
            <SectionLabel>Team Kanban</SectionLabel>
            {/* 온라인 유저 미니뷰 */}
            <OnlineUsers
              users={onlineUsers}
              currentUserId={session?.user?.userId}
              onModalOpenChange={setIsOnlineModalOpen}
            />
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
                  icon={CommentIcon}
                  label="팀 채팅"
                  variant="outlined"
                  onClick={openChat}
                  badge={myUnreadCount}
                />
                <IconButton
                  icon={PlusIcon}
                  label="새 카드 작성"
                  variant="outlined"
                  href={`/teams/${teamId}/tasks/new`}
                />
                <DropdownMenu items={[
                  { label: '팀 초대', icon: UserGroupIcon, onClick: () => setShowInviteModal(true), show: canManageInvites },
                  { label: '태그 관리', icon: TagIcon, onClick: () => setShowTagModal(true) },
                  { label: '팀 수정', icon: EditIcon, href: `/teams/${teamId}/edit` },
                  { label: '사용 가이드', icon: QuestionMarkIcon, onClick: () => setShowTutorial(true) },
                ]} />
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
          onOpenInvite={() => setShowInviteModal(true)}
          telegramStatus={telegramStatus}
          isLoadingTelegram={isLoadingTelegram}
          isCreatingTelegramLink={isCreatingTelegramLink}
          isDeletingTelegramLink={isDeletingTelegramLink}
          onCreateTelegramLink={handleCreateTelegramLink}
          onDeleteTelegramLink={requestDeleteTelegramLink}
          showTelegramDeleteConfirm={showTelegramDeleteConfirm}
          onConfirmDeleteTelegramLink={confirmDeleteTelegramLink}
          onCancelDeleteTelegramLink={cancelDeleteTelegramLink}
          onRefreshTelegramStatus={handleRefreshTelegramStatus}
          discordStatus={discordStatus}
          isLoadingDiscord={isLoadingDiscord}
          isSavingDiscordWebhook={isSavingDiscordWebhook}
          isDeletingDiscordWebhook={isDeletingDiscordWebhook}
          onSaveDiscordWebhook={handleSaveDiscordWebhook}
          onDeleteDiscordWebhook={requestDeleteDiscordWebhook}
          showDiscordDeleteConfirm={showDiscordDeleteConfirm}
          onConfirmDeleteDiscordWebhook={confirmDeleteDiscordWebhook}
          onCancelDeleteDiscordWebhook={cancelDeleteDiscordWebhook}
          onRefreshDiscordStatus={handleRefreshDiscordStatus}
          onOpenRoleChange={handleOpenRoleChange}
          onToggleMemberStatus={handleToggleMemberStatus}
          togglingMemberIds={togglingMemberIds}
        />

        {/* 태스크를 못 불러왔으면 빈 보드 대신 오류와 다시 시도 — 빈 칸반은 "태스크가 없다"로 읽힌다 */}
        {error ? (
          <BoardLoadError
            message={error}
            isAuthRequired={sessionStatus !== 'loading' && !session?.user?.accessToken}
            canRetry={!isNaN(teamIdNum)}
            onRetry={() => setReloadAttempt(n => n + 1)}
          />
        ) : (
        <>

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
          tags={teamTags}
          tagIds={filters.tagIds}
          onTagIdsChange={setTagIds}
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
          <div className="text-xs text-slate-400 mt-2">
            {filteredTasks.length}개 태스크 표시 중 (전체 {allTasks.length}개)
          </div>
        )}

        {/* 데이터 탭 + 보기 전환 버튼 */}
        <ViewModeToggle
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          dataTab={dataTab}
          onDataTabChange={setDataTab}
        />

        {/* 뷰 렌더링 - 로딩 시 스켈레톤 표시 */}
        {isLoading ? (
          {
            list: <ListViewSkeleton />,
            calendar: <CalendarViewSkeleton />,
            gantt: <GanttViewSkeleton />,
            kanban: <KanbanBoardSkeleton />,
          }[viewMode]
        ) : (
          <div
            aria-busy={isTabRefetching}
            className={`transition-opacity duration-150 ${isTabRefetching ? 'pointer-events-none opacity-50' : ''}`}
          >
            {viewMode === 'kanban' ? (
              <Kanban tasksByColumn={filteredTasksByColumn} onStatusChange={handleStatusChange} teamId={teamId} isArchiveView={tasksTab === 'archive'} onRestore={handleRestore} onArchive={tasksTab === 'active' ? handleArchive : undefined} onTagClick={handleTagClick} emptyAction={emptyAction} initialColumnIndex={kanbanColumnIndex} onColumnChange={setKanbanColumnIndex} />
            ) : viewMode === 'gantt' ? (
              <GanttChart tasks={filteredTasks} teamId={teamId} emptyAction={emptyAction} />
            ) : viewMode === 'list' ? (
              <ListView tasks={filteredTasks} teamId={teamId} isArchiveView={tasksTab === 'archive'} onRestore={handleRestore} initialSort={listSort} onSortChange={setListSort} onTagClick={handleTagClick} emptyAction={emptyAction} />
            ) : (
              <CalendarView tasks={filteredTasks} teamId={teamId} initialMonth={calendarMonth} onMonthChange={setCalendarMonth} />
            )}
          </div>
        )}
        </>
        )}
      </TeamsPageLayout>

      {/* 태그 관리 모달 */}
      <TagModal isOpen={showTagModal} onClose={() => setShowTagModal(false)} mode="manage" />

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

      {/* 튜토리얼 가이드 */}
      <TutorialGuide isOpen={showTutorial} onClose={handleCloseTutorial} />

      {/* 팀 채팅 바텀시트 (상태는 레이아웃의 TeamChatProvider) */}
      <TeamChatPanel />

      {/* FAB: 새 카드 작성 (온라인 유저 모달/채팅이 열려있으면 숨김) */}
      {!isOnlineModalOpen && !isChatOpen && <FAB href={`/teams/${teamId}/tasks/new`} label="새 카드 작성" />}
    </>
  );
}
