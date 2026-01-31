import fetchServiceInstance from './FetchService';

// ==================== 공통 에러 처리 ====================

type ErrorMessageMap = {
  401?: string;
  403?: string;
  404?: string;
  400?: string;
  default: string;
};

const DEFAULT_ERROR_MESSAGES = {
  401: '인증이 필요합니다. 다시 로그인해주세요.',
} as const;

/**
 * API 응답 에러를 처리하는 공통 핸들러
 * @param response - fetch Response 객체
 * @param errorMessages - 상태 코드별 에러 메시지 매핑
 */
async function handleApiError(response: Response, errorMessages: ErrorMessageMap): Promise<never> {
  let errorMessage = '';
  
  // 응답 본문에서 에러 메시지 추출 시도
  try {
    const errorText = await response.text();
    if (errorText) {
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData?.message || errorData?.error || errorData?.detail || '';
      } catch {
        errorMessage = errorText;
      }
    }
  } catch {
    // 응답 본문 읽기 실패
  }

  // 401은 항상 동일한 메시지 사용
  if (response.status === 401) {
    throw new Error(DEFAULT_ERROR_MESSAGES[401]);
  }

  // 상태 코드별 커스텀 에러 메시지
  const statusMessage = errorMessages[response.status as keyof ErrorMessageMap];
  if (statusMessage) {
    throw new Error(errorMessage || statusMessage);
  }

  // 기본 에러 메시지
  throw new Error(errorMessage || `${errorMessages.default}: ${response.status}`);
}

// ==================== 타입 정의 ====================

export type TeamMemberResponse = {
  teamId: number;
  userId: number;
  joinedAt: Date;
  role: string;
  teamName: string;
  teamDescription: string | null;
  crtdAt: Date;
  actStatus: number;
  leaderId: number;
};

export type TeamInfoResponse = {
  teamId: number;
  teamName: string;
  teamDescription: string | null;
  leaderId: number;
  crtdAt: Date;
  actStatus: number;
};

export type TeamTaskResponse = {
  taskId: number;
  teamId: number;
  taskName: string;
  taskDescription: string | null;
  taskStatus: number;
  actStatus: number;
  startAt: Date | null;
  endAt: Date | null;
  crtdAt: Date;
  crtdBy: number;
  userName: string | null;
};

export type GetMyTeamsResponse = {
  data: TeamMemberResponse[];
};

export type GetTeamTasksResponse = {
  message: string;
  data: {
    team: TeamInfoResponse;
    tasks: TeamTaskResponse[];
  };
};

export type UpdateTaskStatusResponse = {
  message: string;
  data: TeamTaskResponse;
};

export type TaskCommentResponse = {
  commentId: number;
  teamId: number;
  taskId: number;
  userId: number;
  userName: string | null;
  commentContent: string;
  status: number;
  mdfdAt: Date | null;
  crtdAt: Date;
};

export type TaskDetailResponse = {
  taskId: number;
  teamId: number;
  taskName: string;
  taskDescription: string | null;
  taskStatus: number;
  actStatus: number;
  startAt: Date | null;
  endAt: Date | null;
  crtdAt: Date;
  crtdBy: number;
  userName: string | null;
  comments: TaskCommentResponse[];
};

export type GetTaskDetailResponse = {
  message: string;
  data: TaskDetailResponse;
};

export type CreateTaskCommentRequest = {
  commentContent: string;
};

export type CreateTaskCommentResponse = {
  message: string;
  data: TaskCommentResponse;
};

export type UpdateTaskCommentRequest = {
  commentContent: string;
};

export type UpdateTaskCommentResponse = {
  message: string;
  data: TaskCommentResponse;
};

export type CreateTaskRequest = {
  taskName: string;
  taskDescription: string;
  startAt?: string | null;
  endAt?: string | null;
};

export type CreateTaskResponse = {
  message: string;
  data: TeamTaskResponse;
};

export type UpdateTaskRequest = {
  taskName: string;
  taskDescription: string;
  startAt?: string | null;
  endAt?: string | null;
};

export type UpdateTaskResponse = {
  message: string;
  data: TeamTaskResponse;
};

export type TeamUserResponse = {
  userId: number;
  userName: string | null;
  role: string;
  joinedAt: Date;
};

export type GetTeamUsersResponse = {
  message: string;
  data: TeamUserResponse[];
};

export type CreateTeamRequest = {
  teamName: string;
  teamDescription: string;
};

export type CreateTeamResponse = {
  message: string;
  data: TeamInfoResponse;
};

export type UpdateTeamRequest = {
  teamName: string;
  teamDescription: string;
};

export type UpdateTeamResponse = {
  message: string;
  data: TeamInfoResponse;
};

export type CreateTeamInviteRequest = {
  endAt?: string;
  usageMaxCnt?: number;
};

export type CreateTeamInviteResponse = {
  inviteLink: string;
  endAt: string;
  usageMaxCnt: number;
};

export type TeamInviteResponse = {
  invId: number;
  teamId: number;
  userId: number;
  token: string;
  usageCurCnt: number;
  usageMaxCnt: number;
  actStatus: number;
  endAt: string;
  crtdAt: string;
};

export type GetTeamInvitesResponse = {
  message: string;
  data: TeamInviteResponse[];
};

export type AcceptTeamInviteRequest = {
  token: string;
};

export type AcceptTeamInviteResponse = {
  teamId: number;
  teamName: string;
  message: string;
};

/**
 * 내 팀 목록 조회
 */
export async function getMyTeams(accessToken: string): Promise<GetMyTeamsResponse> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: '/api/v1/teams',
    accessToken,
  });

  if (!response.ok) {
    await handleApiError(response, { default: '팀 목록 조회 실패' });
  }

  return response.json();
}

/**
 * 팀 생성
 */
export async function createTeam(
  request: CreateTeamRequest,
  accessToken: string,
): Promise<CreateTeamResponse> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'POST',
    endpoint: '/api/v1/teams',
    accessToken,
    body: request,
  });

  if (!response.ok) {
    await handleApiError(response, {
      400: '팀 생성 요청이 올바르지 않습니다.',
      default: '팀 생성 실패',
    });
  }

  return response.json();
}

/**
 * 팀 수정
 */
export async function updateTeam(
  teamId: number,
  request: UpdateTeamRequest,
  accessToken: string,
): Promise<UpdateTeamResponse> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'PATCH',
    endpoint: `/api/v1/teams/${teamId}`,
    accessToken,
    body: request,
  });

  if (!response.ok) {
    await handleApiError(response, {
      403: '팀을 수정할 권한이 없습니다.',
      404: '팀을 찾을 수 없습니다.',
      400: '팀 수정 요청이 올바르지 않습니다.',
      default: '팀 수정 실패',
    });
  }

  return response.json();
}

/**
 * 팀 멤버 목록 조회
 */
export async function getTeamUsers(teamId: number, accessToken: string): Promise<GetTeamUsersResponse> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/teams/${teamId}/users`,
    accessToken,
  });

  if (!response.ok) {
    await handleApiError(response, {
      403: '팀 멤버만 접근할 수 있습니다.',
      404: '팀을 찾을 수 없습니다.',
      default: '팀 멤버 목록 조회 실패',
    });
  }

  const data = await response.json();
  // 날짜 변환
  if (data.data && Array.isArray(data.data)) {
    data.data = data.data.map((user: Omit<TeamUserResponse, 'joinedAt'> & { joinedAt: string }) => ({
      ...user,
      joinedAt: new Date(user.joinedAt),
    }));
  }
  return data;
}

/**
 * 팀 태스크 목록 조회
 */
export async function getTeamTasks(teamId: number, accessToken: string): Promise<GetTeamTasksResponse> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/teams/${teamId}/tasks`,
    accessToken,
  });

  if (!response.ok) {
    await handleApiError(response, {
      403: '팀 멤버만 접근할 수 있습니다.',
      default: '태스크 목록 조회 실패',
    });
  }

  return response.json();
}

/**
 * 태스크 생성
 */
export async function createTask(
  teamId: number,
  request: CreateTaskRequest,
  accessToken: string,
): Promise<CreateTaskResponse> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'POST',
    endpoint: `/api/v1/teams/${teamId}/tasks`,
    accessToken,
    body: request,
  });

  if (!response.ok) {
    await handleApiError(response, {
      403: '팀 멤버만 태스크를 생성할 수 있습니다.',
      400: '태스크 생성 요청이 올바르지 않습니다.',
      default: '태스크 생성 실패',
    });
  }

  return response.json();
}

/**
 * 태스크 수정
 */
export async function updateTask(
  teamId: number,
  taskId: number,
  request: UpdateTaskRequest,
  accessToken: string,
): Promise<UpdateTaskResponse> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'PATCH',
    endpoint: `/api/v1/teams/${teamId}/tasks/${taskId}`,
    accessToken,
    body: request,
  });

  if (!response.ok) {
    await handleApiError(response, {
      403: '태스크를 수정할 권한이 없습니다.',
      404: '태스크를 찾을 수 없습니다.',
      400: '태스크 수정 요청이 올바르지 않습니다.',
      default: '태스크 수정 실패',
    });
  }

  return response.json();
}

/**
 * 태스크 상태 변경
 * @param taskStatus 1: CREATED, 2: IN_PROGRESS, 3: COMPLETED, 4: ON_HOLD, 5: CANCELLED
 */
export async function updateTaskStatus(
  teamId: number,
  taskId: number,
  taskStatus: number,
  accessToken: string,
): Promise<UpdateTaskStatusResponse> {
  const requestBody: Record<string, number> = { taskStatus };
  const response = await fetchServiceInstance.backendFetch({
    method: 'PUT',
    endpoint: `/api/v1/teams/${teamId}/tasks/${taskId}/status`,
    accessToken,
    body: requestBody,
  });

  if (!response.ok) {
    await handleApiError(response, {
      403: '팀 멤버만 태스크 상태를 변경할 수 있습니다.',
      default: '태스크 상태 변경 실패',
    });
  }

  return response.json();
}

/**
 * 태스크 상세 조회
 */
export async function getTaskDetail(
  teamId: number,
  taskId: number,
  accessToken: string,
): Promise<GetTaskDetailResponse> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/teams/${teamId}/tasks/${taskId}`,
    accessToken,
  });

  if (!response.ok) {
    await handleApiError(response, {
      403: '팀 멤버만 접근할 수 있습니다.',
      404: '태스크를 찾을 수 없습니다.',
      400: '태스크가 해당 팀에 속하지 않습니다.',
      default: '태스크 상세 조회 실패',
    });
  }

  return response.json();
}

/**
 * 댓글 작성
 */
export async function createTaskComment(
  teamId: number,
  taskId: number,
  request: CreateTaskCommentRequest,
  accessToken: string,
): Promise<CreateTaskCommentResponse> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'POST',
    endpoint: `/api/v1/teams/${teamId}/tasks/${taskId}/comments`,
    accessToken,
    body: request,
  });

  if (!response.ok) {
    await handleApiError(response, {
      403: '팀 멤버만 댓글을 작성할 수 있습니다.',
      400: '태스크가 해당 팀에 속하지 않습니다.',
      default: '댓글 작성 실패',
    });
  }

  return response.json();
}

/**
 * 댓글 수정
 */
export async function updateTaskComment(
  teamId: number,
  taskId: number,
  commentId: number,
  request: UpdateTaskCommentRequest,
  accessToken: string,
): Promise<UpdateTaskCommentResponse> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'PATCH',
    endpoint: `/api/v1/teams/${teamId}/tasks/${taskId}/comments/${commentId}`,
    accessToken,
    body: request,
  });

  if (!response.ok) {
    await handleApiError(response, {
      403: '댓글을 수정할 권한이 없습니다.',
      404: '댓글을 찾을 수 없습니다.',
      400: '태스크가 해당 팀에 속하지 않습니다.',
      default: '댓글 수정 실패',
    });
  }

  return response.json();
}

/**
 * 댓글 삭제
 */
export async function deleteTaskComment(
  teamId: number,
  taskId: number,
  commentId: number,
  accessToken: string,
): Promise<void> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'DELETE',
    endpoint: `/api/v1/teams/${teamId}/tasks/${taskId}/comments/${commentId}`,
    accessToken,
  });

  if (response.ok) return;

  await handleApiError(response, {
    403: '댓글을 삭제할 권한이 없습니다.',
    404: '댓글을 찾을 수 없습니다.',
    400: '태스크가 해당 팀에 속하지 않습니다.',
    default: '댓글 삭제 실패',
  });
}

/**
 * 팀 초대 링크 생성
 */
export async function createTeamInvite(
  teamId: number,
  request: CreateTeamInviteRequest,
  accessToken: string,
): Promise<CreateTeamInviteResponse> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'POST',
    endpoint: `/api/v1/teams/${teamId}/invites`,
    accessToken,
    body: request,
  });

  if (!response.ok) {
    await handleApiError(response, {
      403: '팀 초대 링크를 생성할 권한이 없습니다.',
      404: '팀을 찾을 수 없습니다.',
      400: '팀 초대 링크 생성 요청이 올바르지 않습니다.',
      default: '팀 초대 링크 생성 실패',
    });
  }

  return response.json();
}

/**
 * 팀 초대 링크 목록 조회
 */
export async function getTeamInvites(teamId: number, accessToken: string): Promise<GetTeamInvitesResponse> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/teams/${teamId}/invites`,
    accessToken,
  });

  if (!response.ok) {
    await handleApiError(response, {
      403: '팀 초대 링크 목록을 조회할 권한이 없습니다.',
      404: '팀을 찾을 수 없습니다.',
      default: '팀 초대 링크 목록 조회 실패',
    });
  }

  return response.json();
}

/**
 * 팀 초대 수락
 */
export async function acceptTeamInvite(
  request: AcceptTeamInviteRequest,
  accessToken: string,
): Promise<AcceptTeamInviteResponse> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'POST',
    endpoint: '/api/v1/teams/invites/accept',
    accessToken,
    body: request,
  });

  if (!response.ok) {
    await handleApiError(response, {
      400: '유효하지 않은 초대 토큰입니다.',
      404: '초대 링크를 찾을 수 없습니다.',
      default: '팀 초대 수락 실패',
    });
  }

  return response.json();
}

// ==================== 텔레그램 연동 API ====================

export type CreateTelegramLinkResponse = {
  message: string;
  data: {
    token: string;
    deepLink: string;
    endAt: string;
  };
};

export type TelegramStatusResponse = {
  isLinked: boolean;
  chatId: number | null;
  pendingLink?: {
    token: string;
    deepLink: string;
    endAt: string;
  };
};

export type GetTelegramStatusResponse = {
  message: string;
  data: TelegramStatusResponse;
};

/**
 * 텔레그램 연동 링크 생성
 */
export async function createTelegramLink(
  teamId: number,
  accessToken: string,
): Promise<CreateTelegramLinkResponse> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'POST',
    endpoint: `/api/v1/teams/${teamId}/telegram/link`,
    accessToken,
  });

  if (!response.ok) {
    await handleApiError(response, {
      403: '팀 멤버만 텔레그램 연동을 할 수 있습니다.',
      404: '팀을 찾을 수 없습니다.',
      default: '텔레그램 연동 링크 생성 실패',
    });
  }

  return response.json();
}

/**
 * 텔레그램 연동 상태 조회
 */
export async function getTelegramStatus(
  teamId: number,
  accessToken: string,
): Promise<GetTelegramStatusResponse> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/teams/${teamId}/telegram/status`,
    accessToken,
  });

  if (!response.ok) {
    await handleApiError(response, {
      403: '팀 멤버만 접근할 수 있습니다.',
      404: '팀을 찾을 수 없습니다.',
      default: '텔레그램 연동 상태 조회 실패',
    });
  }

  return response.json();
}

/**
 * 텔레그램 연동 해제
 */
export async function deleteTelegramLink(teamId: number, accessToken: string): Promise<void> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'DELETE',
    endpoint: `/api/v1/teams/${teamId}/telegram/link`,
    accessToken,
  });

  if (response.ok) return;

  await handleApiError(response, {
    403: '팀 멤버만 텔레그램 연동을 해제할 수 있습니다.',
    404: '팀을 찾을 수 없습니다.',
    default: '텔레그램 연동 해제 실패',
  });
}
