/** 태스크에 붙은 태그 (목록·상세 응답, 팀 태그 SORT_ORDER 순) */
export type TaskTag = {
  tagId: number;
  tagName: string;
  /** #RRGGBB 대문자 */
  tagColor: string;
};

/** 팀 태그 정의 (GET /teams/:teamId/tags) */
export type TeamTag = TaskTag & {
  sortOrder: number;
  /** 이 태그가 붙은 태스크 수 (삭제 확인창용) */
  taskCount: number;
};

export type Task = {
  taskId: number;
  teamId: number;
  taskName: string;
  taskDescription: string | null;
  taskStatus: number; // 1: CREATED, 2: IN_PROGRESS, 3: COMPLETED, 4: ON_HOLD, 5: CANCELLED
  actStatus: number;
  startAt: Date | null;
  endAt: Date | null;
  completedAt: Date | null;
  crtdAt: Date;
  crtdBy: number;
  userName: string | null;
  tags: TaskTag[];
};

export type TaskComment = {
  commentId: number;
  teamId: number;
  taskId: number;
  userId: number;
  userName: string | null;
  commentContent: string;
  status: number; // 0: 비활성, 1: 활성
  mdfdAt: Date | null;
  crtdAt: Date;
};

export type TaskDetail = {
  taskId: number;
  teamId: number;
  taskName: string;
  taskDescription: string | null;
  taskStatus: number;
  actStatus: number;
  startAt: Date | null;
  endAt: Date | null;
  completedAt: Date | null;
  crtdAt: Date;
  crtdBy: number;
  userName: string | null;
  tags: TaskTag[];
  comments: TaskComment[];
};

