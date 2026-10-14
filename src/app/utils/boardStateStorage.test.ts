import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadBoardState,
  saveBoardState,
  markTaskOpenedFromBoard,
  consumeTaskOpenedFromBoard,
  consumeBoardReturn,
} from './boardStateStorage';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

const filters = { searchQuery: '회의', assigneeId: 3, period: 'thisWeek' as const, status: 2 as const };

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
});
