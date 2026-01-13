export type Task = {
  taskId: number;
  teamId: number;
  taskName: string;
  taskDescription: string | null;
  taskStatus: number; // 1: CREATED, 2: IN_PROGRESS, 3: COMPLETED, 4: ON_HOLD, 5: CANCELLED
  actStatus: number;
  startAt: Date | null;
  endAt: Date | null;
  crtdAt: Date;
  crtdBy: number;
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
  crtdAt: Date;
  crtdBy: number;
  comments: TaskComment[];
};

