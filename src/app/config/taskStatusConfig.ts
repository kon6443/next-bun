/**
 * 태스크 상태 관리 설정
 * 
 * 숫자 기반 상태값을 워크플로우 기반으로 관리하기 위한 중앙 설정 파일입니다.
 * 새로운 상태 추가 시 이 파일만 수정하면 됩니다.
 */

export type TaskStatusKey = 1 | 2 | 3 | 4 | 5;

export type TaskStatusMeta = {
  key: TaskStatusKey;
  name: string;           // 상태 이름 (영문)
  label: string;          // 표시 라벨 (한글/영문)
  shortLabel: string;     // 짧은 라벨 (버튼용)
  description: string;    // 설명
  accent: string;         // 그라데이션 색상 (아이콘용)
  badgeClassName: string; // 배지 스타일 (Tailwind 클래스)
  isWorkflow: boolean;    // 일반 워크플로우 상태인지 (칸반 보드에 표시)
  order: number;          // 워크플로우 순서 (칸반 보드 컬럼 순서)
};

// 상태 메타데이터 정의
export const TASK_STATUS: Record<TaskStatusKey, TaskStatusMeta> = {
  1: {
    key: 1,
    name: 'CREATED',
    label: 'Ideation',
    shortLabel: 'Ideation',
    description: '아이디어 & 요청',
    accent: 'linear-gradient(135deg, #facc15, #f97316)',
    badgeClassName: 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-400 border-yellow-500/30',
    isWorkflow: true,
    order: 1,
  },
  2: {
    key: 2,
    name: 'IN_PROGRESS',
    label: 'In Progress',
    shortLabel: 'Progress',
    description: '진행 중인 작업',
    accent: 'linear-gradient(135deg, #38bdf8, #6366f1)',
    badgeClassName: 'bg-gradient-to-r from-sky-500/20 to-indigo-500/20 text-sky-400 border-sky-500/30',
    isWorkflow: true,
    order: 2,
  },
  3: {
    key: 3,
    name: 'COMPLETED',
    label: 'Completed',
    shortLabel: 'Done',
    description: '검수 완료',
    accent: 'linear-gradient(135deg, #34d399, #10b981)',
    badgeClassName: 'bg-gradient-to-r from-emerald-500/20 to-green-500/20 text-emerald-400 border-emerald-500/30',
    isWorkflow: true,
    order: 3,
  },
  4: {
    key: 4,
    name: 'ON_HOLD',
    label: 'On Hold',
    shortLabel: 'Hold',
    description: '보류 중',
    accent: 'linear-gradient(135deg, #a78bfa, #8b5cf6)',
    badgeClassName: 'bg-gradient-to-r from-violet-500/20 to-purple-500/20 text-violet-400 border-violet-500/30',
    isWorkflow: true,
    order: 4,
  },
  5: {
    key: 5,
    name: 'CANCELLED',
    label: 'Cancelled',
    shortLabel: 'Cancel',
    description: '취소됨',
    accent: 'linear-gradient(135deg, #f87171, #ef4444)',
    badgeClassName: 'bg-gradient-to-r from-red-500/20 to-rose-500/20 text-red-400 border-red-500/30',
    isWorkflow: true,
    order: 5,
  },
};

/**
 * 상태 전이 맵
 * 각 상태에서 이동 가능한 상태 목록을 정의합니다.
 * 
 * 비즈니스 로직:
 * - Ideation(1) → In Progress(2), Cancelled(5)
 * - In Progress(2) → Ideation(1), Completed(3), On Hold(4), Cancelled(5)
 * - Completed(3) → In Progress(2) (재작업 필요시)
 * - On Hold(4) → Ideation(1), In Progress(2), Completed(3), Cancelled(5)
 * - Cancelled(5) → 이동 불가 (필요시 Ideation으로 복구 가능)
 */
export const STATUS_TRANSITIONS: Record<TaskStatusKey, TaskStatusKey[]> = {
  1: [2, 5],       // Ideation → In Progress, Cancelled
  2: [1, 3, 4, 5], // In Progress → Ideation, Completed, On Hold, Cancelled
  3: [2],          // Completed → In Progress (재작업)
  4: [1, 2, 3, 5], // On Hold → 복귀 가능한 모든 상태
  5: [],           // Cancelled → 이동 불가
};

/**
 * 칸반 보드에 표시되는 워크플로우 상태만 가져오기
 * 순서대로 정렬됨
 */
export function getWorkflowStatuses(): TaskStatusMeta[] {
  return Object.values(TASK_STATUS)
    .filter(status => status.isWorkflow)
    .sort((a, b) => a.order - b.order);
}

/**
 * 특정 상태에서 이동 가능한 상태 목록 가져오기
 */
export function getAvailableTransitions(currentStatus: TaskStatusKey): TaskStatusMeta[] {
  const availableKeys = STATUS_TRANSITIONS[currentStatus] || [];
  return availableKeys.map(key => TASK_STATUS[key]);
}

/**
 * 특정 상태에서 다른 상태로 전이 가능한지 확인
 */
export function canTransitionTo(currentStatus: TaskStatusKey, targetStatus: TaskStatusKey): boolean {
  const availableKeys = STATUS_TRANSITIONS[currentStatus] || [];
  return availableKeys.includes(targetStatus);
}

/**
 * 워크플로우 내에서 "다음" 상태 가져오기 (순차 진행용)
 * 칸반 보드에서 주요 진행 방향을 나타냄
 */
export function getNextWorkflowStatus(currentStatus: TaskStatusKey): TaskStatusMeta | null {
  const current = TASK_STATUS[currentStatus];
  if (!current || !current.isWorkflow) return null;
  
  const workflowStatuses = getWorkflowStatuses();
  const currentIndex = workflowStatuses.findIndex(s => s.key === currentStatus);
  
  if (currentIndex === -1 || currentIndex >= workflowStatuses.length - 1) return null;
  
  const nextStatus = workflowStatuses[currentIndex + 1];
  // 전이 가능한지 확인
  if (canTransitionTo(currentStatus, nextStatus.key)) {
    return nextStatus;
  }
  return null;
}

/**
 * 워크플로우 내에서 "이전" 상태 가져오기 (되돌리기용)
 */
export function getPrevWorkflowStatus(currentStatus: TaskStatusKey): TaskStatusMeta | null {
  const current = TASK_STATUS[currentStatus];
  if (!current || !current.isWorkflow) return null;
  
  const workflowStatuses = getWorkflowStatuses();
  const currentIndex = workflowStatuses.findIndex(s => s.key === currentStatus);
  
  if (currentIndex <= 0) return null;
  
  const prevStatus = workflowStatuses[currentIndex - 1];
  // 전이 가능한지 확인
  if (canTransitionTo(currentStatus, prevStatus.key)) {
    return prevStatus;
  }
  return null;
}

/**
 * 상태 키로 컬럼 키 가져오기 (칸반 보드용)
 */
export type ColumnKey = 'todo' | 'inProgress' | 'done' | 'onHold' | 'cancelled';

export const STATUS_TO_COLUMN: Record<TaskStatusKey, ColumnKey> = {
  1: 'todo',
  2: 'inProgress',
  3: 'done',
  4: 'onHold',
  5: 'cancelled',
};

export const COLUMN_TO_STATUS: Record<ColumnKey, TaskStatusKey> = {
  todo: 1,
  inProgress: 2,
  done: 3,
  onHold: 4,
  cancelled: 5,
};

/**
 * 상태 키로 메타데이터 가져오기 (안전한 버전)
 * 존재하지 않는 키는 기본값(1: Ideation) 반환
 */
export function getStatusMeta(statusKey: number): TaskStatusMeta {
  return TASK_STATUS[statusKey as TaskStatusKey] || TASK_STATUS[1];
}

/**
 * 상태 키로 라벨 가져오기
 */
export function getStatusLabel(statusKey: number): string {
  return getStatusMeta(statusKey).label;
}

/**
 * 상태 키로 배지 클래스 가져오기
 */
export function getStatusBadgeClassName(statusKey: number): string {
  return getStatusMeta(statusKey).badgeClassName;
}

/**
 * 상태 키로 그라데이션 색상 가져오기
 */
export function getStatusAccent(statusKey: number): string {
  return getStatusMeta(statusKey).accent;
}

/**
 * 모든 상태 목록 가져오기 (필터 드롭다운용)
 */
export function getAllStatuses(): TaskStatusMeta[] {
  return Object.values(TASK_STATUS).sort((a, b) => a.order - b.order);
}
