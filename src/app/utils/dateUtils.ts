/**
 * 날짜 관련 유틸리티 함수
 * GanttChart, CalendarView 등에서 공통으로 사용
 *
 * DB에서 UTC로 저장된 날짜를 브라우저 로컬 타임존으로 변환하여 표시합니다.
 */

// ==================== 날짜 계산 함수 ====================

/**
 * 두 날짜 사이의 일수 계산 (로컬 기준)
 * @param start 시작 날짜
 * @param end 종료 날짜
 * @returns 일수 (음수 가능)
 */
export function daysBetween(start: Date, end: Date): number {
  const s = new Date(start);
  const e = new Date(end);
  const startTime = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
  const endTime = new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime();
  return Math.ceil((endTime - startTime) / (1000 * 60 * 60 * 24));
}

/**
 * 날짜 범위 생성 (로컬 기준, start ~ end 포함)
 * @param start 시작 날짜
 * @param end 종료 날짜
 * @returns Date 배열 (로컬 자정 기준)
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
 * 날짜를 로컬 자정(00:00:00)으로 정규화
 * @param date 정규화할 날짜
 * @returns 로컬 자정으로 설정된 새 Date 객체
 */
export function normalizeDate(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

/**
 * 로컬 "오늘"을 자정 Date 객체로 반환
 * 캘린더/간트 차트에서 "오늘" 기준 날짜 생성 시 사용
 */
export function getToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * 로컬 "오늘"을 YYYY-MM-DD 키 문자열로 반환
 * 캘린더에서 오늘 셀 하이라이트 비교 시 사용
 */
export function getTodayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ==================== 태스크 날짜+시간 조합 ====================

/** 시작일 기본 시간 */
export const DEFAULT_START_TIME = '00:00';
/** 종료일 기본 시간 */
export const DEFAULT_END_TIME = '23:59';

/**
 * 날짜(YYYY-MM-DD) + 시간(HH:MM) → ISO datetime 문자열 조합
 * 브라우저가 로컬(KST)로 해석 후 UTC 변환하여 ISO 문자열로 반환
 * 시작일: 초는 항상 :00, 종료일: 초는 항상 :59
 */
export function buildTaskDatetime(
  date: string,
  time: string | undefined,
  type: 'start' | 'end',
): string | null {
  if (!date) return null;
  const t = time || (type === 'start' ? DEFAULT_START_TIME : DEFAULT_END_TIME);
  const seconds = type === 'start' ? '00' : '59';
  return new Date(`${date}T${t}:${seconds}`).toISOString();
}

/**
 * ISO datetime 또는 Date → 날짜(YYYY-MM-DD) + 시간(HH:MM) 분리 (로컬 기준)
 */
export function parseTaskDatetime(value: Date | string | null | undefined): { date: string; time: string } {
  if (!value) return { date: '', time: '' };
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return { date: '', time: '' };
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  };
}

// ==================== 캘린더 관련 함수 ====================

/**
 * 월의 첫 날과 마지막 날 계산 (로컬 기준)
 * @param year 연도
 * @param month 월 (0-11)
 */
export function getMonthDays(year: number, month: number): { firstDay: Date; lastDay: Date } {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  return { firstDay, lastDay };
}

/**
 * 캘린더 그리드 생성 (6주 = 42일 고정, 로컬 기준)
 * @param year 연도
 * @param month 월 (0-11)
 * @returns Date 배열 (이전달, 현재달, 다음달 날짜 포함, 모두 로컬 자정)
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
 * 주말 여부 확인 (로컬 기준)
 * @param date Date 객체
 * @returns 주말(토, 일)이면 true
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * 오늘인지 확인
 * 입력 날짜의 로컬 날짜가 로컬 "오늘"과 같은지 비교
 * @param date 확인할 날짜
 * @returns 오늘이면 true
 */
export function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}
