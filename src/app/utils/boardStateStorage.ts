/**
 * 팀 보드 화면 상태 보존 (sessionStorage, 팀별 키)
 *
 * 태스크 상세에 갔다가 돌아왔을 때 보던 스크롤·탭·필터·칸반 컬럼·보기로 복원한다.
 * 저장소를 쓸 수 없거나(프라이빗 모드·차단) 값이 깨져 있으면 조용히 기본값으로 동작한다.
 */
import type { PeriodFilter, StatusFilter } from './taskUtils';

export type BoardViewMode = 'kanban' | 'gantt' | 'list' | 'calendar';
export type BoardDataTab = 'active' | 'archive';

export type BoardFilters = {
  searchQuery: string;
  assigneeId: number | null;
  period: PeriodFilter;
  status: StatusFilter;
};

export type BoardState = {
  scrollY: number;
  dataTab: BoardDataTab;
  view: BoardViewMode;
  filters: BoardFilters;
  kanbanColumnIndex: number;
};

const BOARD_KEY_PREFIX = 'teamBoardState:';
const OPENED_FROM_BOARD_KEY = 'taskOpenedFromBoard';
const BOARD_RETURN_KEY_PREFIX = 'teamBoardReturn:';

const VIEW_MODES: readonly BoardViewMode[] = ['kanban', 'gantt', 'list', 'calendar'];
const DATA_TABS: readonly BoardDataTab[] = ['active', 'archive'];
const PERIODS: readonly PeriodFilter[] = ['all', 'today', 'thisWeek', 'thisMonth', 'overdue'];
const STATUSES: readonly StatusFilter[] = ['all', 1, 2, 3, 4, 5];

function readItem(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeItem(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // 저장소를 쓸 수 없으면 보존만 포기한다
  }
}

function removeItem(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // 저장소를 쓸 수 없으면 무시
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function parseFilters(value: unknown): BoardFilters | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const f = value as Record<string, unknown>;
  if (typeof f.searchQuery !== 'string') return undefined;
  if (f.assigneeId !== null && !isNonNegativeInteger(f.assigneeId)) return undefined;
  if (!PERIODS.includes(f.period as PeriodFilter)) return undefined;
  if (!STATUSES.includes(f.status as StatusFilter)) return undefined;
  return {
    searchQuery: f.searchQuery,
    assigneeId: f.assigneeId as number | null,
    period: f.period as PeriodFilter,
    status: f.status as StatusFilter,
  };
}

/** 저장된 보드 상태. 필드별로 검증해 유효한 것만 돌려준다 */
export function loadBoardState(teamId: string): Partial<BoardState> {
  const raw = readItem(BOARD_KEY_PREFIX + teamId);
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null) return {};
  const s = parsed as Record<string, unknown>;

  const state: Partial<BoardState> = {};
  if (isNonNegativeInteger(s.scrollY)) state.scrollY = s.scrollY;
  if (DATA_TABS.includes(s.dataTab as BoardDataTab)) state.dataTab = s.dataTab as BoardDataTab;
  if (VIEW_MODES.includes(s.view as BoardViewMode)) state.view = s.view as BoardViewMode;
  if (isNonNegativeInteger(s.kanbanColumnIndex)) state.kanbanColumnIndex = s.kanbanColumnIndex;
  const filters = parseFilters(s.filters);
  if (filters) state.filters = filters;
  return state;
}

/** 일부 필드만 갱신해 저장한다 (나머지는 기존 값 유지) */
export function saveBoardState(teamId: string, patch: Partial<BoardState>): void {
  const next = { ...loadBoardState(teamId), ...patch };
  writeItem(BOARD_KEY_PREFIX + teamId, JSON.stringify(next));
}

/**
 * 보드에서 태스크 상세로 이동하기 직전에 호출
 * - 현재 스크롤 위치를 바로 저장한다 (스크롤 저장 디바운스가 끝나기 전에 이동해도 마지막 위치가 남게)
 * - 상세의 "돌아가기"가 history back을 쓸 수 있도록 표시를 남긴다
 */
export function markTaskOpenedFromBoard(teamId: string | number, taskId: number): void {
  saveBoardState(String(teamId), { scrollY: Math.round(window.scrollY) });
  writeItem(OPENED_FROM_BOARD_KEY, `${teamId}:${taskId}`);
  writeItem(BOARD_RETURN_KEY_PREFIX + teamId, '1');
}

/**
 * 보드가 상세에서 돌아온 진입인지 확인하고 표시를 지운다 (1회용)
 * 돌아온 경우에만 탭·필터·스크롤·컬럼을 복원한다 — 새 태스크 작성 후 이동 같은 다른 진입은 기본 상태로 시작
 */
export function consumeBoardReturn(teamId: string | number): boolean {
  const key = BOARD_RETURN_KEY_PREFIX + teamId;
  const returning = readItem(key) === '1';
  if (returning) removeItem(key);
  return returning;
}

/**
 * 이 상세 화면이 같은 팀 보드에서 열렸는지 확인하고 표시를 지운다 (1회용)
 * 지우지 않으면 나중에 다른 경로로 같은 상세에 왔을 때 history back이 보드가 아닌 곳으로 갈 수 있다
 */
export function consumeTaskOpenedFromBoard(teamId: string | number, taskId: number): boolean {
  const opened = readItem(OPENED_FROM_BOARD_KEY) === `${teamId}:${taskId}`;
  if (opened) removeItem(OPENED_FROM_BOARD_KEY);
  return opened;
}
