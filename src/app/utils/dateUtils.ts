/**
 * 날짜 관련 유틸리티 함수
 * GanttChart, CalendarView 등에서 공통으로 사용
 */

// ==================== 날짜 계산 함수 ====================

/**
 * 두 날짜 사이의 일수 계산
 * @param start 시작 날짜
 * @param end 종료 날짜
 * @returns 일수 (음수 가능)
 */
export function daysBetween(start: Date, end: Date): number {
  const startTime = new Date(start).setHours(0, 0, 0, 0);
  const endTime = new Date(end).setHours(0, 0, 0, 0);
  return Math.ceil((endTime - startTime) / (1000 * 60 * 60 * 24));
}

/**
 * 날짜 범위 생성 (start ~ end 포함)
 * @param start 시작 날짜
 * @param end 종료 날짜
 * @returns Date 배열
 */
export function generateDateRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setHours(0, 0, 0, 0);

  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/**
 * 날짜를 자정(00:00:00)으로 정규화
 * @param date 정규화할 날짜
 * @returns 자정으로 설정된 새 Date 객체
 */
export function normalizeDate(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

// ==================== 캘린더 관련 함수 ====================

/**
 * 월의 첫 날과 마지막 날 계산
 * @param year 연도
 * @param month 월 (0-11)
 */
export function getMonthDays(year: number, month: number): { firstDay: Date; lastDay: Date } {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  return { firstDay, lastDay };
}

/**
 * 캘린더 그리드 생성 (6주 = 42일 고정)
 * @param year 연도
 * @param month 월 (0-11)
 * @returns Date 배열 (이전달, 현재달, 다음달 날짜 포함)
 */
export function generateCalendarGrid(year: number, month: number): Date[] {
  const { firstDay, lastDay } = getMonthDays(year, month);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const grid: Date[] = [];

  // 이전 달의 날짜
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    grid.push(new Date(year, month - 1, prevMonthLastDay - i));
  }

  // 현재 달의 날짜
  for (let day = 1; day <= daysInMonth; day++) {
    grid.push(new Date(year, month, day));
  }

  // 다음 달의 날짜 (6주 고정)
  let nextDay = 1;
  while (grid.length < 42) {
    grid.push(new Date(year, month + 1, nextDay++));
  }

  return grid;
}

/**
 * 캘린더 그리드를 주 단위로 분할
 * @param grid 캘린더 그리드 배열
 * @returns 주 단위로 분할된 2차원 배열
 */
export function splitIntoWeeks<T>(grid: T[]): T[][] {
  const weeks: T[][] = [];
  for (let i = 0; i < grid.length; i += 7) {
    weeks.push(grid.slice(i, i + 7));
  }
  return weeks;
}

// ==================== 요일/주말 헬퍼 ====================

/** 요일 한글 라벨 */
export const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

/**
 * 주말 여부 확인
 * @param date Date 객체
 * @returns 주말(토, 일)이면 true
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * 오늘인지 확인
 * @param date 확인할 날짜
 * @returns 오늘이면 true
 */
export function isToday(date: Date): boolean {
  const today = normalizeDate(new Date());
  const target = normalizeDate(date);
  return today.getTime() === target.getTime();
}
