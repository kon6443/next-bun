'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Task } from '../types/task';
import { getDeadlineStatus } from '../utils/taskUtils';

type CalendarViewProps = {
  tasks: Task[];
  teamId: string;
};

// 상태별 색상
const statusColors: Record<number, string> = {
  1: 'bg-gradient-to-r from-yellow-500/80 to-orange-500/80 border-yellow-500/50',
  2: 'bg-gradient-to-r from-sky-500/80 to-indigo-500/80 border-sky-500/50',
  3: 'bg-gradient-to-r from-emerald-500/80 to-green-500/80 border-emerald-500/50',
};

// 마감일 상태에 따른 테두리 색상
const deadlineBorderColors: Record<string, string> = {
  overdue: 'ring-2 ring-red-500/50',
  today: 'ring-2 ring-orange-500/50',
  soon: 'ring-1 ring-yellow-500/50',
  normal: '',
  none: '',
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 날짜 키 생성 (YYYY-MM-DD)
function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 날짜를 자정으로 정규화
function normalizeDate(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

// 태스크가 멀티 데이인지 확인
function isMultiDayTask(task: Task): boolean {
  if (!task.startAt || !task.endAt) return false;
  const start = normalizeDate(new Date(task.startAt));
  const end = normalizeDate(new Date(task.endAt));
  return start.getTime() < end.getTime();
}

// 태스크가 특정 날짜 범위와 겹치는지 확인
function taskOverlapsRange(task: Task, rangeStart: Date, rangeEnd: Date): boolean {
  const taskStart = task.startAt ? normalizeDate(new Date(task.startAt)) : null;
  const taskEnd = task.endAt ? normalizeDate(new Date(task.endAt)) : null;
  
  if (!taskStart && !taskEnd) return false;
  
  const start = taskStart || taskEnd!;
  const end = taskEnd || taskStart!;
  
  return start <= rangeEnd && end >= rangeStart;
}

// 월의 첫 날과 마지막 날 계산
function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  return { firstDay, lastDay };
}

// 캘린더 그리드 생성 (날짜 객체 배열)
function generateCalendarGrid(year: number, month: number): (Date | null)[] {
  const { firstDay, lastDay } = getMonthDays(year, month);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const grid: (Date | null)[] = [];

  // 이전 달의 날짜 (빈 칸 대신 실제 날짜)
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

// 주 단위로 캘린더 분할
function splitIntoWeeks(grid: (Date | null)[]): (Date | null)[][] {
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < grid.length; i += 7) {
    weeks.push(grid.slice(i, i + 7));
  }
  return weeks;
}

// 멀티 데이 태스크 바 정보
type TaskBar = {
  task: Task;
  startCol: number;
  span: number;
  row: number;
  isStart: boolean;  // 이 주에서 태스크가 시작하는지
  isEnd: boolean;    // 이 주에서 태스크가 끝나는지
};

// 주에 걸치는 멀티 데이 태스크 바 계산
function getTaskBarsForWeek(weekDates: (Date | null)[], multiDayTasks: Task[]): TaskBar[] {
  const bars: Omit<TaskBar, 'row'>[] = [];
  
  // 주의 시작일과 종료일 찾기
  const validDates = weekDates.filter((d): d is Date => d !== null);
  if (validDates.length === 0) return [];
  
  const weekStart = normalizeDate(validDates[0]);
  const weekEnd = normalizeDate(validDates[validDates.length - 1]);
  
  multiDayTasks.forEach(task => {
    if (!taskOverlapsRange(task, weekStart, weekEnd)) return;
    
    const taskStart = task.startAt ? normalizeDate(new Date(task.startAt)) : weekStart;
    const taskEnd = task.endAt ? normalizeDate(new Date(task.endAt)) : weekEnd;
    
    // 시작 열 계산
    let startCol = 0;
    for (let i = 0; i < weekDates.length; i++) {
      const date = weekDates[i];
      if (date && normalizeDate(date) >= taskStart) {
        startCol = i;
        break;
      }
    }
    
    // 종료 열 계산
    let endCol = weekDates.length - 1;
    for (let i = weekDates.length - 1; i >= 0; i--) {
      const date = weekDates[i];
      if (date && normalizeDate(date) <= taskEnd) {
        endCol = i;
        break;
      }
    }
    
    const span = endCol - startCol + 1;
    const isStart = taskStart >= weekStart && taskStart <= weekEnd;
    const isEnd = taskEnd >= weekStart && taskEnd <= weekEnd;
    
    bars.push({ task, startCol, span, isStart, isEnd });
  });
  
  // 겹치지 않도록 row 배치
  return assignRows(bars);
}

// 바들을 row에 배치 (겹치지 않도록)
function assignRows(bars: Omit<TaskBar, 'row'>[]): TaskBar[] {
  // 시작 열 기준 정렬
  const sorted = [...bars].sort((a, b) => a.startCol - b.startCol);
  const result: TaskBar[] = [];
  const rowEnds: number[] = []; // 각 row의 마지막 열
  
  sorted.forEach(bar => {
    // 사용 가능한 row 찾기
    let assignedRow = -1;
    for (let r = 0; r < rowEnds.length; r++) {
      if (rowEnds[r] < bar.startCol) {
        assignedRow = r;
        break;
      }
    }
    
    if (assignedRow === -1) {
      assignedRow = rowEnds.length;
      rowEnds.push(-1);
    }
    
    rowEnds[assignedRow] = bar.startCol + bar.span - 1;
    result.push({ ...bar, row: assignedRow });
  });
  
  return result;
}

export function CalendarView({ tasks, teamId }: CalendarViewProps) {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // 캘린더 그리드
  const calendarGrid = useMemo(() => generateCalendarGrid(year, month), [year, month]);
  
  // 주 단위로 분할
  const weeks = useMemo(() => splitIntoWeeks(calendarGrid), [calendarGrid]);

  // 멀티 데이 태스크와 단일 데이 태스크 분리
  const { multiDayTasks, singleDayTasks } = useMemo(() => {
    const multi: Task[] = [];
    const single: Task[] = [];
    
    tasks.forEach(task => {
      if (isMultiDayTask(task)) {
        multi.push(task);
      } else if (task.startAt || task.endAt) {
        single.push(task);
      }
    });
    
    return { multiDayTasks: multi, singleDayTasks: single };
  }, [tasks]);

  // 단일 데이 태스크를 날짜별로 그룹화
  const singleDayTasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();

    singleDayTasks.forEach(task => {
      // startAt 또는 endAt 기준
      const dateStr = task.startAt || task.endAt;
      if (dateStr) {
        const key = getDateKey(new Date(dateStr));
        const existing = map.get(key) || [];
        map.set(key, [...existing, task]);
      }
    });

    return map;
  }, [singleDayTasks]);

  // 마감일 없는 태스크
  const tasksWithoutDate = useMemo(() => {
    return tasks.filter(task => !task.startAt && !task.endAt);
  }, [tasks]);

  // 오늘 날짜 키
  const todayKey = getDateKey(new Date());

  // 이전/다음 달 이동
  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const handleTaskClick = (e: React.MouseEvent, taskId: number) => {
    e.stopPropagation();
    router.push(`/teams/${teamId}/tasks/${taskId}`);
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_25px_60px_rgba(15,23,42,0.55)] backdrop-blur-xl">
      {/* 헤더 */}
      <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.4em] text-slate-400">Calendar</p>
          <p className="mt-1 text-sm text-slate-500">마감일 기준 표시</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevMonth}
            className="rounded-lg border border-white/10 bg-slate-900/50 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/50"
          >
            ◀
          </button>
          <span className="min-w-[120px] text-center text-sm font-semibold text-white">
            {year}년 {month + 1}월
          </span>
          <button
            onClick={goToNextMonth}
            className="rounded-lg border border-white/10 bg-slate-900/50 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/50"
          >
            ▶
          </button>
          <button
            onClick={goToToday}
            className="ml-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-400 hover:bg-sky-500/20"
          >
            오늘
          </button>
        </div>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b border-white/10">
        {WEEKDAYS.map((day, idx) => (
          <div
            key={day}
            className={`py-2 text-center text-xs font-semibold ${
              idx === 0 ? 'text-red-400' : idx === 6 ? 'text-sky-400' : 'text-slate-400'
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* 캘린더 그리드 - 주 단위 렌더링 */}
      <div>
        {weeks.map((weekDates, weekIdx) => {
          const taskBars = getTaskBarsForWeek(weekDates, multiDayTasks);
          const maxRow = taskBars.length > 0 ? Math.max(...taskBars.map(b => b.row)) + 1 : 0;
          // 멀티 데이 슬롯 높이: 최소 0, 최대 2줄 (더 많으면 +n more 표시)
          const displayRows = Math.min(maxRow, 2);
          const multiDaySlotHeight = displayRows * 20;
          const hasMoreBars = maxRow > 2;
          
          return (
            <div key={weekIdx} className="relative">
              {/* 날짜 셀들 */}
              <div className="grid grid-cols-7">
                {weekDates.map((date, dayIdx) => {
                  if (!date) {
                    return (
                      <div
                        key={`empty-${weekIdx}-${dayIdx}`}
                        className="min-h-[100px] border-b border-r border-white/5 bg-slate-900/20 p-1"
                      />
                    );
                  }

                  const dateKey = getDateKey(date);
                  const dayTasks = singleDayTasksByDate.get(dateKey) || [];
                  const isToday = dateKey === todayKey;
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  const isCurrentMonth = date.getMonth() === month;

                  return (
                    <div
                      key={dateKey}
                      className={`min-h-[100px] border-b border-r border-white/5 p-1 transition ${
                        isToday ? 'bg-sky-500/10' : isWeekend ? 'bg-slate-900/30' : ''
                      } ${!isCurrentMonth ? 'opacity-40' : ''}`}
                    >
                      {/* 날짜 */}
                      <div className="mb-1 flex items-center justify-between">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                            isToday
                              ? 'bg-sky-500 font-bold text-white'
                              : date.getDay() === 0
                                ? 'text-red-400'
                                : date.getDay() === 6
                                  ? 'text-sky-400'
                                  : 'text-slate-400'
                          }`}
                        >
                          {date.getDate()}
                        </span>
                        {(dayTasks.length > 2 || hasMoreBars) && dayIdx === 6 && (
                          <span className="text-[10px] text-slate-500">
                            {hasMoreBars ? `+${maxRow - 2}` : `+${dayTasks.length - 2}`}
                          </span>
                        )}
                      </div>

                      {/* 멀티 데이 태스크 슬롯 영역 - 투명 공간 확보 */}
                      {multiDaySlotHeight > 0 && (
                        <div style={{ height: multiDaySlotHeight }} />
                      )}

                      {/* 단일 데이 태스크 목록 (최대 2개) */}
                      <div className="space-y-1">
                        {dayTasks.slice(0, 2).map(task => {
                          const deadlineStatus = task.taskStatus !== 3 ? getDeadlineStatus(task.endAt) : 'normal';
                          return (
                            <div
                              key={task.taskId}
                              onClick={e => handleTaskClick(e, task.taskId)}
                              className={`cursor-pointer truncate rounded border px-1.5 py-0.5 text-[10px] font-medium text-white transition hover:brightness-110 ${
                                statusColors[task.taskStatus] || statusColors[1]
                              } ${deadlineBorderColors[deadlineStatus]}`}
                              title={`${task.taskName}${deadlineStatus === 'overdue' ? ' (지연됨)' : deadlineStatus === 'today' ? ' (오늘 마감)' : ''}`}
                            >
                              {task.taskName}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* 멀티 데이 태스크 바들 - 날짜 위에 absolute로 배치 */}
              {taskBars.slice(0, displayRows * 7).map((bar, barIdx) => {
                if (bar.row >= displayRows) return null;
                
                const deadlineStatus = bar.task.taskStatus !== 3 ? getDeadlineStatus(bar.task.endAt) : 'normal';
                const leftPercent = (bar.startCol / 7) * 100;
                const widthPercent = (bar.span / 7) * 100;
                // 날짜(28px) + 마진(4px) 이후부터 시작
                const topOffset = 32 + bar.row * 20;
                
                return (
                  <div
                    key={`${bar.task.taskId}-${barIdx}`}
                    className={`absolute cursor-pointer truncate border text-[10px] font-medium text-white transition hover:brightness-110 hover:z-10 ${
                      statusColors[bar.task.taskStatus] || statusColors[1]
                    } ${deadlineBorderColors[deadlineStatus]} ${
                      bar.isStart ? 'rounded-l' : ''
                    } ${bar.isEnd ? 'rounded-r' : ''}`}
                    style={{
                      left: `calc(${leftPercent}% + 2px)`,
                      width: `calc(${widthPercent}% - 4px)`,
                      top: topOffset,
                      height: 18,
                      paddingLeft: 6,
                      paddingRight: 6,
                      lineHeight: '18px',
                    }}
                    onClick={e => handleTaskClick(e, bar.task.taskId)}
                    title={`${bar.task.taskName}${deadlineStatus === 'overdue' ? ' (지연됨)' : deadlineStatus === 'today' ? ' (오늘 마감)' : ''}`}
                  >
                    {bar.isStart && bar.task.taskName}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* 날짜 미지정 태스크 */}
      {tasksWithoutDate.length > 0 && (
        <div className="mt-6">
          <p className="mb-3 text-xs font-semibold text-slate-500">날짜 미지정 ({tasksWithoutDate.length})</p>
          <div className="flex flex-wrap gap-2">
            {tasksWithoutDate.map(task => (
              <div
                key={task.taskId}
                onClick={e => handleTaskClick(e, task.taskId)}
                className={`cursor-pointer truncate rounded-lg border px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 ${
                  statusColors[task.taskStatus] || statusColors[1]
                }`}
                title={task.taskName}
              >
                {task.taskName}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
