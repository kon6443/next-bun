import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadBoardState,
  saveBoardState,
  markTaskOpenedFromBoard,
  consumeTaskOpenedFromBoard,
  consumeBoardReturn,
  parseDataTabParam,
  buildBoardHref,
  BOARD_RETURN_TTL_MS,
} from './boardStateStorage';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

const filters = { searchQuery: '회의', assigneeId: 3, period: 'thisWeek' as const, status: 2 as const, tagIds: [4, 9] };

describe('boardStateStorage', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { sessionStorage: createMemoryStorage(), scrollY: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('저장한 상태를 팀별로 그대로 불러온다', () => {
    saveBoardState('7', { scrollY: 420, dataTab: 'archive', view: 'list', filters, kanbanColumnIndex: 2 });
    expect(loadBoardState('7')).toEqual({ scrollY: 420, dataTab: 'archive', view: 'list', filters, kanbanColumnIndex: 2 });
    expect(loadBoardState('8')).toEqual({});
  });

  it('일부 필드만 저장해도 나머지 필드는 유지된다', () => {
    saveBoardState('7', { dataTab: 'archive', kanbanColumnIndex: 1 });
    saveBoardState('7', { scrollY: 100 });
    expect(loadBoardState('7')).toEqual({ dataTab: 'archive', kanbanColumnIndex: 1, scrollY: 100 });
  });

  it('깨진 JSON이나 잘못된 값은 버리고 유효한 필드만 돌려준다', () => {
    window.sessionStorage.setItem('teamBoardState:1', '{not json');
    expect(loadBoardState('1')).toEqual({});

    window.sessionStorage.setItem(
      'teamBoardState:2',
      JSON.stringify({ scrollY: -5, dataTab: 'deleted', view: 'gantt', kanbanColumnIndex: 1.5, filters: { ...filters, period: 'yesterday' } }),
    );
    expect(loadBoardState('2')).toEqual({ view: 'gantt' });
  });

  it('태그 필터 도입 전에 저장된 필터(tagIds 없음)도 나머지 필터를 살려 빈 태그 선택으로 복원한다', () => {
    const legacyFilters = { searchQuery: filters.searchQuery, assigneeId: filters.assigneeId, period: filters.period, status: filters.status };
    window.sessionStorage.setItem('teamBoardState:3', JSON.stringify({ filters: legacyFilters }));
    expect(loadBoardState('3')).toEqual({ filters: { ...legacyFilters, tagIds: [] } });
  });

  it('tagIds의 잘못된 항목은 버리고 정수 ID만 남긴다', () => {
    window.sessionStorage.setItem('teamBoardState:4', JSON.stringify({ filters: { ...filters, tagIds: [4, '9', -1, 2.5, 7] } }));
    expect(loadBoardState('4').filters?.tagIds).toEqual([4, 7]);
  });

  it('저장소를 쓸 수 없으면 던지지 않고 기본값으로 동작한다', () => {
    const throwing = () => {
      throw new Error('SecurityError');
    };
    vi.stubGlobal('window', { sessionStorage: { getItem: throwing, setItem: throwing, removeItem: throwing }, scrollY: 0 });
    expect(() => saveBoardState('7', { scrollY: 10 })).not.toThrow();
    expect(loadBoardState('7')).toEqual({});
    expect(() => markTaskOpenedFromBoard('7', 1)).not.toThrow();
    expect(consumeTaskOpenedFromBoard('7', 1)).toBe(false);
  });

  it('보드에서 연 태스크인지는 팀과 태스크가 모두 같을 때만 true', () => {
    markTaskOpenedFromBoard('7', 15);
    expect(consumeTaskOpenedFromBoard('7', 16)).toBe(false);
    expect(consumeTaskOpenedFromBoard('8', 15)).toBe(false);
    expect(consumeTaskOpenedFromBoard('7', 15)).toBe(true);
  });

  it('표시는 1회용 — 한 번 확인하면 지워진다', () => {
    markTaskOpenedFromBoard('7', 15);
    expect(consumeTaskOpenedFromBoard('7', 15)).toBe(true);
    expect(consumeTaskOpenedFromBoard('7', 15)).toBe(false);
  });

  it('보드 복원 표시는 상세로 이동할 때만 남고 1회용이다 (새 태스크 작성 후 등 다른 진입은 복원하지 않음)', () => {
    expect(consumeBoardReturn('7')).toBe(false);
    markTaskOpenedFromBoard('7', 15);
    expect(consumeBoardReturn('8')).toBe(false);
    expect(consumeBoardReturn('7')).toBe(true);
    expect(consumeBoardReturn('7')).toBe(false);
  });

  it('상세로 이동할 때 현재 스크롤 위치를 바로 저장한다', () => {
    vi.stubGlobal('window', { sessionStorage: createMemoryStorage(), scrollY: 812.4 });
    saveBoardState('7', { dataTab: 'archive' });
    markTaskOpenedFromBoard('7', 15);
    expect(loadBoardState('7')).toEqual({ dataTab: 'archive', scrollY: 812 });
  });

  it('캘린더 달·리스트 정렬을 저장하고, 형식이 틀린 값은 버린다', () => {
    saveBoardState('7', { calendarMonth: '2026-03', listSort: { key: 'endAt', order: 'asc' } });
    expect(loadBoardState('7')).toEqual({ calendarMonth: '2026-03', listSort: { key: 'endAt', order: 'asc' } });

    window.sessionStorage.setItem(
      'teamBoardState:8',
      JSON.stringify({ calendarMonth: '2026-13', listSort: { key: 'unknown', order: 'asc' } }),
    );
    expect(loadBoardState('8')).toEqual({});
  });

  it('복귀 표시는 유효 시간이 지나면 복원하지 않는다 (표시는 지운다)', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    markTaskOpenedFromBoard('7', 15);
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + BOARD_RETURN_TTL_MS + 1);
    expect(consumeBoardReturn('7')).toBe(false);
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + BOARD_RETURN_TTL_MS + 2);
    expect(consumeBoardReturn('7')).toBe(false);
    vi.restoreAllMocks();
  });

  it('이전 형식(시각 없는 표시)은 복원하지 않는다', () => {
    window.sessionStorage.setItem('teamBoardReturn:7', '1');
    expect(consumeBoardReturn('7')).toBe(false);
  });

  it('URL 탭 파라미터는 archive만 보관함, 나머지는 활성', () => {
    expect(parseDataTabParam('archive')).toBe('archive');
    expect(parseDataTabParam('active')).toBe('active');
    expect(parseDataTabParam(null)).toBe('active');
    expect(parseDataTabParam('ARCHIVE')).toBe('active');
  });

  it('보드 주소는 기본값(칸반·활성) 파라미터를 생략한다', () => {
    expect(buildBoardHref('7', {})).toBe('/teams/7');
    expect(buildBoardHref('7', { view: 'kanban', dataTab: 'active' })).toBe('/teams/7');
    expect(buildBoardHref('7', { view: 'calendar' })).toBe('/teams/7?view=calendar');
    expect(buildBoardHref('7', { view: 'list', dataTab: 'archive' })).toBe('/teams/7?view=list&tab=archive');
  });

  it('태그를 주면 그 태그로 거른 보드 주소(?tag=)를 만든다', () => {
    expect(buildBoardHref('7', { tagId: 12 })).toBe('/teams/7?tag=12');
    expect(buildBoardHref('7', { view: 'list', tagId: 12 })).toBe('/teams/7?view=list&tag=12');
  });

  it('undefined로 저장하면 이전에 저장한 달·정렬을 지운다', () => {
    saveBoardState('7', { calendarMonth: '2026-03', listSort: { key: 'endAt', order: 'asc' } });
    saveBoardState('7', { calendarMonth: undefined, listSort: undefined });
    expect(loadBoardState('7')).toEqual({});
  });
});
