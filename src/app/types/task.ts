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

