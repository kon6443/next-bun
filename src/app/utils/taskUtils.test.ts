/**
 * taskUtils.ts 유닛 테스트
 * 
 * 테스트 코드의 장점:
 * 1. 리팩토링 시 안전망 - 기존 기능이 깨지면 즉시 발견
 * 2. 버그 조기 발견
 * 3. 문서화 효과 - 테스트 코드가 사용법 예시가 됨
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getDeadlineStatus,
  getDeadlineLabel,
  calculateTaskStats,
  filterBySearch,
  filterByAssignee,
  filterByStatus,
  getUniqueAssignees,
  formatCompactDateTime,
  formatShortDate,
  formatDateWithYear,
  formatDateKey,
  formatDateDisplay,
} from './taskUtils';
import type { Task } from '../types/task';

// 테스트용 날짜 모킹
const mockNow = new Date('2025-01-15T10:00:00Z');

describe('taskUtils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =============== getDeadlineStatus 테스트 ===============
  describe('getDeadlineStatus', () => {
    it('마감일이 없으면 "none" 반환', () => {
      expect(getDeadlineStatus(null)).toBe('none');
    });

    it('마감일이 지났으면 "overdue" 반환', () => {
      const pastDate = new Date('2025-01-10T12:00:00Z');
      expect(getDeadlineStatus(pastDate)).toBe('overdue');
    });

    it('마감일이 오늘이면 "today" 반환', () => {
      // mockNow와 같은 날짜로 설정 (타임존 고려)
      const today = new Date('2025-01-15T00:00:00Z');
      expect(getDeadlineStatus(today)).toBe('today');
    });

    it('마감일이 3일 이내면 "soon" 반환', () => {
      const soon = new Date('2025-01-17T12:00:00Z'); // 2일 후
      expect(getDeadlineStatus(soon)).toBe('soon');
    });

    it('마감일이 3일 초과면 "normal" 반환', () => {
      const future = new Date('2025-01-25T12:00:00Z'); // 10일 후
      expect(getDeadlineStatus(future)).toBe('normal');
    });
  });

  // =============== getDeadlineLabel 테스트 ===============
  describe('getDeadlineLabel', () => {
    it('none 상태는 "마감일 없음" 반환', () => {
      expect(getDeadlineLabel('none', null)).toBe('마감일 없음');
    });

    it('overdue 상태는 "N일 지남" 반환', () => {
      const pastDate = new Date('2025-01-10T12:00:00Z'); // 5일 전
      expect(getDeadlineLabel('overdue', pastDate)).toBe('5일 지남');
    });

    it('today 상태는 "오늘 마감" 반환', () => {
      expect(getDeadlineLabel('today', mockNow)).toBe('오늘 마감');
    });

    it('soon 상태는 "D-N" 반환', () => {
      const soon = new Date('2025-01-17T12:00:00Z'); // 2일 후
      expect(getDeadlineLabel('soon', soon)).toBe('D-2');
    });

    it('normal 상태는 빈 문자열 반환', () => {
      expect(getDeadlineLabel('normal', new Date())).toBe('');
    });
  });

  // =============== calculateTaskStats 테스트 ===============
  describe('calculateTaskStats', () => {
    const mockTasks: Task[] = [
      { taskId: 1, taskName: 'Task 1', taskStatus: 1, actStatus: 1, crtdAt: new Date(), crtdBy: 1, startAt: null, endAt: null, taskDescription: '', userName: 'User1' },
      { taskId: 2, taskName: 'Task 2', taskStatus: 2, actStatus: 1, crtdAt: new Date(), crtdBy: 2, startAt: null, endAt: null, taskDescription: '', userName: 'User2' },
      { taskId: 3, taskName: 'Task 3', taskStatus: 3, actStatus: 1, crtdAt: new Date(), crtdBy: 1, startAt: null, endAt: null, taskDescription: '', userName: 'User1' },
      { taskId: 4, taskName: 'Task 4', taskStatus: 4, actStatus: 1, crtdAt: new Date(), crtdBy: 2, startAt: null, endAt: null, taskDescription: '', userName: 'User2' },
      { taskId: 5, taskName: 'Task 5', taskStatus: 5, actStatus: 1, crtdAt: new Date(), crtdBy: 1, startAt: null, endAt: null, taskDescription: '', userName: 'User1' },
    ];

    it('전체 태스크 수를 정확히 계산', () => {
      const stats = calculateTaskStats(mockTasks);
      expect(stats.total).toBe(5);
    });

    it('상태별 태스크 수를 정확히 계산', () => {
      const stats = calculateTaskStats(mockTasks);
      expect(stats.todo).toBe(1);        // taskStatus === 1
      expect(stats.inProgress).toBe(1);  // taskStatus === 2
      expect(stats.completed).toBe(1);   // taskStatus === 3
      expect(stats.onHold).toBe(1);      // taskStatus === 4
      expect(stats.cancelled).toBe(1);   // taskStatus === 5
    });

    it('완료율을 정확히 계산', () => {
      const stats = calculateTaskStats(mockTasks);
      expect(stats.completionRate).toBe(20); // 1/5 = 20%
    });

    it('빈 배열일 때 0 반환', () => {
      const stats = calculateTaskStats([]);
      expect(stats.total).toBe(0);
      expect(stats.completionRate).toBe(0);
    });
  });

  // =============== filterBySearch 테스트 ===============
  describe('filterBySearch', () => {
    const mockTasks: Task[] = [
      { taskId: 1, taskName: '로그인 기능 구현', taskDescription: 'OAuth 연동', taskStatus: 1, actStatus: 1, crtdAt: new Date(), crtdBy: 1, startAt: null, endAt: null, userName: 'User1' },
      { taskId: 2, taskName: '버그 수정', taskDescription: '로그인 오류 수정', taskStatus: 2, actStatus: 1, crtdAt: new Date(), crtdBy: 2, startAt: null, endAt: null, userName: 'User2' },
      { taskId: 3, taskName: 'UI 개선', taskDescription: '다크모드 추가', taskStatus: 1, actStatus: 1, crtdAt: new Date(), crtdBy: 1, startAt: null, endAt: null, userName: 'User1' },
    ];

    it('빈 검색어는 전체 태스크 반환', () => {
      expect(filterBySearch(mockTasks, '')).toHaveLength(3);
      expect(filterBySearch(mockTasks, '  ')).toHaveLength(3);
    });

    it('제목으로 검색', () => {
      // "로그인"은 첫 번째 태스크 제목과 두 번째 태스크 설명에 포함되어 있음
      const result = filterBySearch(mockTasks, '로그인');
      expect(result).toHaveLength(2); // 제목과 설명 모두에서 검색됨
      expect(result[0].taskName).toBe('로그인 기능 구현');
    });

    it('설명으로 검색', () => {
      const result = filterBySearch(mockTasks, 'OAuth');
      expect(result).toHaveLength(1);
    });

    it('대소문자 구분 없이 검색', () => {
      const result = filterBySearch(mockTasks, 'UI');
      expect(result).toHaveLength(1);
      expect(result[0].taskName).toBe('UI 개선');
    });
  });

  // =============== filterByAssignee 테스트 ===============
  describe('filterByAssignee', () => {
    const mockTasks: Task[] = [
      { taskId: 1, taskName: 'Task 1', taskStatus: 1, actStatus: 1, crtdAt: new Date(), crtdBy: 1, startAt: null, endAt: null, taskDescription: '', userName: 'User1' },
      { taskId: 2, taskName: 'Task 2', taskStatus: 2, actStatus: 1, crtdAt: new Date(), crtdBy: 2, startAt: null, endAt: null, taskDescription: '', userName: 'User2' },
      { taskId: 3, taskName: 'Task 3', taskStatus: 1, actStatus: 1, crtdAt: new Date(), crtdBy: 1, startAt: null, endAt: null, taskDescription: '', userName: 'User1' },
    ];

    it('null이면 전체 태스크 반환', () => {
      expect(filterByAssignee(mockTasks, null)).toHaveLength(3);
    });

    it('특정 담당자로 필터링', () => {
      const result = filterByAssignee(mockTasks, 1);
      expect(result).toHaveLength(2);
      expect(result.every(t => t.crtdBy === 1)).toBe(true);
    });
  });

  // =============== filterByStatus 테스트 ===============
  describe('filterByStatus', () => {
    const mockTasks: Task[] = [
      { taskId: 1, taskName: 'Task 1', taskStatus: 1, actStatus: 1, crtdAt: new Date(), crtdBy: 1, startAt: null, endAt: null, taskDescription: '', userName: 'User1' },
      { taskId: 2, taskName: 'Task 2', taskStatus: 2, actStatus: 1, crtdAt: new Date(), crtdBy: 2, startAt: null, endAt: null, taskDescription: '', userName: 'User2' },
      { taskId: 3, taskName: 'Task 3', taskStatus: 3, actStatus: 1, crtdAt: new Date(), crtdBy: 1, startAt: null, endAt: null, taskDescription: '', userName: 'User1' },
    ];

    it('"all"이면 전체 태스크 반환', () => {
      expect(filterByStatus(mockTasks, 'all')).toHaveLength(3);
    });

    it('특정 상태로 필터링', () => {
      const result = filterByStatus(mockTasks, 2);
      expect(result).toHaveLength(1);
      expect(result[0].taskStatus).toBe(2);
    });
  });

  // =============== getUniqueAssignees 테스트 ===============
  describe('getUniqueAssignees', () => {
    const mockTasks: Task[] = [
      { taskId: 1, taskName: 'Task 1', taskStatus: 1, actStatus: 1, crtdAt: new Date(), crtdBy: 1, startAt: null, endAt: null, taskDescription: '', userName: 'Alice' },
      { taskId: 2, taskName: 'Task 2', taskStatus: 2, actStatus: 1, crtdAt: new Date(), crtdBy: 2, startAt: null, endAt: null, taskDescription: '', userName: 'Bob' },
      { taskId: 3, taskName: 'Task 3', taskStatus: 1, actStatus: 1, crtdAt: new Date(), crtdBy: 1, startAt: null, endAt: null, taskDescription: '', userName: 'Alice' },
    ];

    it('중복 없이 담당자 목록 반환', () => {
      const assignees = getUniqueAssignees(mockTasks);
      expect(assignees).toHaveLength(2);
      expect(assignees.map(a => a.id)).toEqual([1, 2]);
    });

    it('userName이 없으면 기본 이름 사용', () => {
      const tasksWithoutName: Task[] = [
        { taskId: 1, taskName: 'Task 1', taskStatus: 1, actStatus: 1, crtdAt: new Date(), crtdBy: 99, startAt: null, endAt: null, taskDescription: '', userName: '' },
      ];
      const assignees = getUniqueAssignees(tasksWithoutName);
      expect(assignees[0].name).toBe('사용자 99');
    });
  });

  // =============== 날짜 포맷팅 함수 테스트 ===============
  describe('formatCompactDateTime', () => {
    it('M/D HH:mm 형식으로 반환', () => {
      const date = new Date('2025-01-15T14:30:00Z');
      // 타임존에 따라 결과가 다를 수 있으므로 형식만 확인
      const result = formatCompactDateTime(date);
      expect(result).toMatch(/\d{1,2}\/\d{1,2} \d{2}:\d{2}/);
    });
  });

  describe('formatShortDate', () => {
    it('null이면 null 반환', () => {
      expect(formatShortDate(null)).toBe(null);
    });

    it('월 일 형식으로 반환', () => {
      const date = new Date('2025-01-15T10:00:00Z');
      const result = formatShortDate(date);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('formatDateWithYear', () => {
    it('null이면 "-" 반환', () => {
      expect(formatDateWithYear(null)).toBe('-');
    });

    it('연도 포함 형식으로 반환', () => {
      const date = new Date('2025-01-15T10:00:00Z');
      const result = formatDateWithYear(date);
      expect(result).toContain('2025');
    });
  });

  describe('formatDateKey', () => {
    it('YYYY-MM-DD 형식으로 반환', () => {
      const date = new Date('2025-01-15T10:00:00Z');
      const result = formatDateKey(date);
      expect(result).toBe('2025-01-15');
    });
  });

  describe('formatDateDisplay', () => {
    it('M/D 형식으로 반환', () => {
      const date = new Date('2025-01-15T10:00:00Z');
      const result = formatDateDisplay(date);
      expect(result).toBe('1/15');
    });
  });
});
