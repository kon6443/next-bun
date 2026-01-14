import fetchServiceInstance from './FetchService';

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
    if (response.status === 401) {
      throw new Error('인증이 필요합니다. 다시 로그인해주세요.');
    }
    const errorText = await response.text();
    throw new Error(`팀 목록 조회 실패: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data;
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
    if (response.status === 401) {
      throw new Error('인증이 필요합니다. 다시 로그인해주세요.');
    }
    if (response.status === 400) {
      throw new Error('팀 생성 요청이 올바르지 않습니다.');
    }
    const errorText = await response.text();
    throw new Error(`팀 생성 실패: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data;
}

/**
 * 팀 멤버 목록 조회
 */
export async function getTeamUsers(
  teamId: number,
  accessToken: string,
): Promise<GetTeamUsersResponse> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/teams/${teamId}/users`,
    accessToken,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('인증이 필요합니다. 다시 로그인해주세요.');
    }
    if (response.status === 403) {
      throw new Error('팀 멤버만 접근할 수 있습니다.');
    }
    if (response.status === 404) {
      throw new Error('팀을 찾을 수 없습니다.');
    }
    const errorText = await response.text();
    throw new Error(`팀 멤버 목록 조회 실패: ${response.status} - ${errorText}`);
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
export async function getTeamTasks(
  teamId: number,
  accessToken: string,
): Promise<GetTeamTasksResponse> {
  const response = await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint: `/api/v1/teams/${teamId}/tasks`,
    accessToken,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('인증이 필요합니다. 다시 로그인해주세요.');
    }
    if (response.status === 403) {
      throw new Error('팀 멤버만 접근할 수 있습니다.');
    }
    const errorText = await response.text();
    throw new Error(`태스크 목록 조회 실패: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data;
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
    if (response.status === 401) {
      throw new Error('인증이 필요합니다. 다시 로그인해주세요.');
    }
    if (response.status === 403) {
      throw new Error('팀 멤버만 태스크를 생성할 수 있습니다.');
    }
    if (response.status === 400) {
      throw new Error('태스크 생성 요청이 올바르지 않습니다.');
    }
    const errorText = await response.text();
    throw new Error(`태스크 생성 실패: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data;
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
    let errorMessage = '';
    try {
      const errorText = await response.text();
      if (errorText) {
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData?.message || errorData?.error || errorData?.detail || errorText;
        } catch {
          errorMessage = errorText;
        }
      }
    } catch {
      // 응답 본문 읽기 실패
    }

    if (response.status === 401) {
      throw new Error('인증이 필요합니다. 다시 로그인해주세요.');
    }
    if (response.status === 403) {
      throw new Error('태스크를 수정할 권한이 없습니다.');
    }
    if (response.status === 404) {
      throw new Error(errorMessage || '태스크를 찾을 수 없습니다.');
    }
    if (response.status === 400) {
      throw new Error(errorMessage || '태스크 수정 요청이 올바르지 않습니다.');
    }
    throw new Error(errorMessage || `태스크 수정 실패: ${response.status}`);
  }

  const data = await response.json();
  return data;
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
    if (response.status === 401) {
      throw new Error('인증이 필요합니다. 다시 로그인해주세요.');
    }
    if (response.status === 403) {
      throw new Error('팀 멤버만 태스크 상태를 변경할 수 있습니다.');
    }
    const errorText = await response.text();
    throw new Error(`태스크 상태 변경 실패: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data;
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
    if (response.status === 401) {
      throw new Error('인증이 필요합니다. 다시 로그인해주세요.');
    }
    if (response.status === 403) {
      throw new Error('팀 멤버만 접근할 수 있습니다.');
    }
    if (response.status === 404) {
      throw new Error('태스크를 찾을 수 없습니다.');
    }
    if (response.status === 400) {
      throw new Error('태스크가 해당 팀에 속하지 않습니다.');
    }
    const errorText = await response.text();
    throw new Error(`태스크 상세 조회 실패: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data;
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
    if (response.status === 401) {
      throw new Error('인증이 필요합니다. 다시 로그인해주세요.');
    }
    if (response.status === 403) {
      throw new Error('팀 멤버만 댓글을 작성할 수 있습니다.');
    }
    if (response.status === 400) {
      throw new Error('태스크가 해당 팀에 속하지 않습니다.');
    }
    const errorText = await response.text();
    throw new Error(`댓글 작성 실패: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data;
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
    if (response.status === 401) {
      throw new Error('인증이 필요합니다. 다시 로그인해주세요.');
    }
    if (response.status === 403) {
      throw new Error('댓글을 수정할 권한이 없습니다.');
    }
    if (response.status === 404) {
      throw new Error('댓글을 찾을 수 없습니다.');
    }
    if (response.status === 400) {
      throw new Error('태스크가 해당 팀에 속하지 않습니다.');
    }
    const errorText = await response.text();
    throw new Error(`댓글 수정 실패: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data;
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

  // DELETE 요청 성공 시 (200, 204 등) 바로 반환
  if (response.ok) {
    return;
  }

  // 에러 발생 시에만 응답 본문 읽기
  let errorMessage = '';
  try {
    const errorText = await response.text();
    if (errorText) {
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData?.message || errorData?.error || errorData?.detail || errorText;
      } catch {
        errorMessage = errorText;
      }
    }
  } catch {
    // 응답 본문 읽기 실패
  }

  // 상태 코드별 에러 처리
  if (response.status === 401) {
    throw new Error('인증이 필요합니다. 다시 로그인해주세요.');
  }
  if (response.status === 403) {
    throw new Error('댓글을 삭제할 권한이 없습니다.');
  }
  if (response.status === 404) {
    throw new Error('댓글을 찾을 수 없습니다.');
  }
  if (response.status === 400) {
    throw new Error(errorMessage || '태스크가 해당 팀에 속하지 않습니다.');
  }
  throw new Error(errorMessage || `댓글 삭제 실패: ${response.status}`);
}
