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
