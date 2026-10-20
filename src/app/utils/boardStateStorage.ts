/**
 * 팀 보드 화면 상태 보존 (sessionStorage, 팀별 키)
 *
 * 태스크 상세에 갔다가 돌아왔을 때 보던 스크롤·탭·필터·칸반 컬럼·보기로 복원한다.
 * 저장소를 쓸 수 없거나(프라이빗 모드·차단) 값이 깨져 있으면 조용히 기본값으로 동작한다.
 */
import type { PeriodFilter, StatusFilter } from './taskUtils';

export type BoardViewMode = 'kanban' | 'gantt' | 'list' | 'calendar';
export type BoardDataTab = 'active' | 'archive';
export type ListSortKey = 'taskName' | 'taskStatus' | 'userName' | 'startAt' | 'endAt' | 'crtdAt';
export type ListSort = { key: ListSortKey; order: 'asc' | 'desc' };

export type BoardFilters = {
  searchQuery: string;
  assigneeId: number | null;
  period: PeriodFilter;
  status: StatusFilter;
  tagIds: number[];
};

export type BoardState = {
  scrollY: number;
  dataTab: BoardDataTab;
  view: BoardViewMode;
  filters: BoardFilters;
  kanbanColumnIndex: number;
  /** 캘린더에서 보던 달 'YYYY-MM' */
  calendarMonth: string;
  /** 리스트 정렬 */
  listSort: ListSort;
};

const BOARD_KEY_PREFIX = 'teamBoardState:';
const OPENED_FROM_BOARD_KEY = 'taskOpenedFromBoard';
const BOARD_RETURN_KEY_PREFIX = 'teamBoardReturn:';

/** 보기 방식 목록 (SSOT) — URL `?view=` 검증과 저장값 검증이 함께 쓴다 */
export const VIEW_MODES: readonly BoardViewMode[] = ['kanban', 'gantt', 'list', 'calendar'];
const DATA_TABS: readonly BoardDataTab[] = ['active', 'archive'];
const LIST_SORT_KEYS: readonly ListSortKey[] = ['taskName', 'taskStatus', 'userName', 'startAt', 'endAt', 'crtdAt'];
const CALENDAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
/** 상세에서 돌아왔다는 표시의 유효 시간 — 상세에서 보드를 거치지 않고 떠났다가 한참 뒤 들어올 때 옛 상태를 복원하지 않게 */
export const BOARD_RETURN_TTL_MS = 30 * 60 * 1000;
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
    // 태그 필터 도입 전에 저장된 값에는 tagIds가 없다 — 없거나 깨졌으면 빈 선택으로 보고 나머지 필터는 살린다.
    // 그사이 삭제된 태그 ID는 여기서 알 수 없다 — 팀 태그를 받은 뒤 보드가 걸러낸다
    tagIds: Array.isArray(f.tagIds) ? f.tagIds.filter(isNonNegativeInteger) : [],
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
  if (typeof s.calendarMonth === 'string' && CALENDAR_MONTH_PATTERN.test(s.calendarMonth)) {
    state.calendarMonth = s.calendarMonth;
  }
  const listSort = s.listSort as Record<string, unknown> | null | undefined;
  if (
    typeof listSort === 'object' && listSort !== null &&
    LIST_SORT_KEYS.includes(listSort.key as ListSortKey) &&
    (listSort.order === 'asc' || listSort.order === 'desc')
  ) {
    state.listSort = { key: listSort.key as ListSortKey, order: listSort.order };
  }
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
  writeItem(BOARD_RETURN_KEY_PREFIX + teamId, String(Date.now()));
}

/**
 * 보드가 상세에서 돌아온 진입인지 확인하고 표시를 지운다 (1회용)
 * 돌아온 경우에만 탭·필터·스크롤·컬럼을 복원한다 — 새 태스크 작성 후 이동 같은 다른 진입은 기본 상태로 시작
 */
export function consumeBoardReturn(teamId: string | number): boolean {
  const key = BOARD_RETURN_KEY_PREFIX + teamId;
  const raw = readItem(key);
  if (raw === null) return false;
  removeItem(key);
  const markedAt = Number(raw);
  // 표시한 시각이 없거나(이전 형식) 유효 시간이 지났으면 복원하지 않는다
  return Number.isFinite(markedAt) && Date.now() - markedAt <= BOARD_RETURN_TTL_MS;
}

/** URL `?tab=` 값 → 데이터 탭 (보관함만 파라미터로 남기고 나머지는 활성) */
export function parseDataTabParam(value: string | null | undefined): BoardDataTab {
  return value === 'archive' ? 'archive' : 'active';
}

/**
 * 보드 주소 — 기본값(칸반·활성)은 파라미터를 생략한다
 * tagId를 주면 보드가 그 태그로 거른 채 열린다(`?tag=`, 적용 후 보드가 주소에서 지운다)
 */
export function buildBoardHref(
  teamId: string | number,
  { view, dataTab, tagId }: { view?: BoardViewMode; dataTab?: BoardDataTab; tagId?: number },
): string {
  const params = new URLSearchParams();
  if (view && view !== 'kanban') params.set('view', view);
  if (dataTab === 'archive') params.set('tab', 'archive');
  if (tagId !== undefined) params.set('tag', String(tagId));
  const query = params.toString();
  return `/teams/${teamId}${query ? `?${query}` : ''}`;
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
