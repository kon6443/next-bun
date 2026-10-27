'use client';

import { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Task } from '../types/task';
import { formatDateKey, getTaskDeadlineInfo, type DeadlineStatus } from '../utils/taskUtils';
import { normalizeDate, generateCalendarGrid, splitIntoWeeks, WEEKDAYS_KO, isWeekend as isWeekendDate, getTodayKey } from '../utils/dateUtils';
import { getStatusBgClassName, getStatusBorderClassName } from '../config/taskStatusConfig';
import { viewContainerStyles } from '@/styles/teams';
import { CloseIcon } from './Icons';
import { markTaskOpenedFromBoard } from '../utils/boardStateStorage';
import { countHiddenTasksForDay, CALENDAR_VISIBLE_ROWS, parseCalendarMonth, formatCalendarMonth, choosePopoverPlacement } from '../utils/calendarUtils';

type CalendarViewProps = {
  tasks: Task[];
  teamId: string;
  /** 처음 보여 줄 달 'YYYY-MM' (없으면 이번 달) — 상세 왕복·보기 전환 후 보던 달로 돌아오게 */
  initialMonth?: string;
  onMonthChange?: (month: string) => void;
};


// 팝오버에 표시할 태스크 정보
type PopoverState = {
  isOpen: boolean;
  dateKey: string;
  date: Date | null;
  tasks: Task[];
  position: { top: number; left: number };
  /** 남은 공간에 맞춘 최대 높이 (없으면 기본 max-h-80) */
  maxHeight?: number;
};

/** 더보기 팝오버 너비 (w-64) */
const POPOVER_WIDTH = 256;

// 마감일 상태에 따른 테두리 색상
const deadlineBorderColors: Record<DeadlineStatus, string> = {
  overdue: 'ring-2 ring-red-500/50',
  today: 'ring-2 ring-orange-500/50',
  soon: 'ring-1 ring-yellow-500/50',
  normal: '',
  none: '',
};

// 상태별 색상 헬퍼 함수
function getTaskStatusClassName(taskStatus: number): string {
  return `${getStatusBgClassName(taskStatus)} ${getStatusBorderClassName(taskStatus)}`;
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

/**
 * 고정 요소가 제자리에 있을 때의 위쪽 — 자동 숨김 하단 내비(ui-bnb-autohide)는 transform으로 내려가 있거나 올라오는 중일 수 있다
 * 조금만 올려도 다시 나타나니 화면 밖 위치가 아니라 제자리(bottom 기준 레이아웃 위치)를 경계로 삼는다. bottom을 모르면 지금 위치
 */
function overlayRestingTop(overlay: HTMLElement, rect: DOMRect): number {
  const style = window.getComputedStyle(overlay);
  const bottom = parseFloat(style.bottom);
  if (style.position !== 'fixed' || !Number.isFinite(bottom)) return rect.top;
  return Math.min(rect.top, window.innerHeight - bottom - overlay.offsetHeight);
}

export function CalendarView({ tasks, teamId, initialMonth, onMonthChange }: CalendarViewProps) {
  const router = useRouter();
  const [currentDate, setCurrentDateState] = useState(() => parseCalendarMonth(initialMonth));
  const setCurrentDate = (date: Date) => {
    setCurrentDateState(date);
    onMonthChange?.(formatCalendarMonth(date));
  };
  const [popover, setPopover] = useState<PopoverState>({
    isOpen: false,
    dateKey: '',
    date: null,
    tasks: [],
    position: { top: 0, left: 0 },
  });
  const popoverRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // 팝오버를 연 "+N개" 버튼 — 키보드로 열었다 닫으면 포커스를 여기로 돌려준다
  const popoverTriggerRef = useRef<HTMLElement | null>(null);
  const closePopover = () => {
    if (popoverRef.current?.contains(document.activeElement)) popoverTriggerRef.current?.focus();
    setPopover(prev => ({ ...prev, isOpen: false }));
  };

  // 팝오버 외부 클릭·Esc 시 닫기
  useEffect(() => {
    if (!popover.isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setPopover(prev => ({ ...prev, isOpen: false }));
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (popoverRef.current?.contains(document.activeElement)) popoverTriggerRef.current?.focus();
      setPopover(prev => ({ ...prev, isOpen: false }));
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [popover.isOpen]);

  // 더보기 클릭 핸들러
  const handleMoreClick = (e: React.MouseEvent, date: Date, allTasks: Task[]) => {
    e.stopPropagation();
    popoverTriggerRef.current = e.currentTarget as HTMLElement;
    const container = containerRef.current;
    if (!container) return;
    // 팝오버는 컨테이너 기준 absolute — 버튼 위치를 컨테이너 좌표로 변환한다 (페이지 스크롤과 함께 움직임)
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const left = rect.left - containerRect.left - container.clientLeft;
    setPopover({
      isOpen: true,
      dateKey: formatDateKey(date),
      date,
      tasks: allTasks,
      position: {
        top: rect.bottom - containerRect.top - container.clientTop + 8,
        left: Math.max(0, Math.min(left, container.clientWidth - POPOVER_WIDTH)),
      },
    });
  };

  // 열리면 팝오버로 포커스를 옮긴다 — 키보드 사용자가 달력 전체를 Tab으로 지나가지 않고 바로 목록에 닿게
  useEffect(() => {
    // 위로 띄울 공간도 없어 화면 밖에 걸친 경우 포커스 때문에 페이지가 튀지 않게
    if (popover.isOpen) popoverRef.current?.focus({ preventScroll: true });
  }, [popover.isOpen, popover.dateKey]);

  // 팝오버 위치·높이 — 실제로 보이는 영역 안에 둔다 (페인트 전에 계산, 스크롤·리사이즈 때 다시)
  // 아래 경계는 innerHeight 가 아니라 화면 하단 고정 요소(하단 내비·FAB, data-fixed-bottom-overlay)의 위쪽,
  // 위 경계는 달력 헤더 아래 — 위로 띄워도 월 이동 버튼을 덮지 않게
  useLayoutEffect(() => {
    if (!popover.isOpen) return;
    // 위·아래는 열 때 한 번 정하고, 스크롤·리사이즈 때는 그 방향에서 높이·위치만 다시 맞춘다
    let placement: 'below' | 'above' | undefined;
    const place = () => {
      const el = popoverRef.current;
      const trigger = popoverTriggerRef.current;
      const container = containerRef.current;
      if (!el || !trigger || !container || !trigger.isConnected) return;
      const anchor = trigger.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const originTop = containerRect.top + container.clientTop;
      const popLeft = containerRect.left + container.clientLeft + el.offsetLeft;
      const popRight = popLeft + el.offsetWidth;

      let bottomLimit = window.innerHeight;
      document.querySelectorAll<HTMLElement>('[data-fixed-bottom-overlay]').forEach(overlay => {
        const r = overlay.getBoundingClientRect();
        // 보이고, 팝오버와 가로로 겹치는 고정 요소만 경계로 삼는다
        if (r.height > 0 && r.left < popRight && r.right > popLeft) bottomLimit = Math.min(bottomLimit, overlayRestingTop(overlay, r));
      });
      const headerBottom = headerRef.current?.getBoundingClientRect().bottom ?? 0;

      const result = choosePopoverPlacement({
        anchorTop: anchor.top,
        anchorBottom: anchor.bottom,
        topLimit: Math.max(8, headerBottom + 8),
        bottomLimit: bottomLimit - 8,
        // scrollHeight 에는 테두리가 빠진다 (border-box 실제 높이 = 내용 + 위아래 테두리)
        contentHeight: el.scrollHeight + (el.offsetHeight - el.clientHeight),
        placement,
      });
      placement = result.placement;
      const { maxHeight, top } = result;
      const nextTop = Math.round(top - originTop);
      setPopover(prev =>
        prev.position.top === nextTop && prev.maxHeight === maxHeight
          ? prev
          : { ...prev, position: { ...prev.position, top: nextTop }, maxHeight },
      );
    };

    place();
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [popover.isOpen, popover.dateKey]);

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
        const key = formatDateKey(new Date(dateStr));
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

  // 오늘 날짜 키 (로컬 타임존 기준)
  const todayKey = getTodayKey();

  // 이전/다음 달 이동 — 열린 팝오버는 이전 달 날짜의 목록이라 닫는다
  const goToPrevMonth = () => {
    closePopover();
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    closePopover();
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    closePopover();
    setCurrentDate(new Date());
  };

  const openTask = (taskId: number) => {
    markTaskOpenedFromBoard(teamId, taskId);
    router.push(`/teams/${teamId}/tasks/${taskId}`);
  };

  const handleTaskClick = (e: React.MouseEvent, taskId: number) => {
    e.stopPropagation();
    openTask(taskId);
  };

  // div 로 그린 태스크 항목을 키보드(Enter·Space)로도 열 수 있게 — 레이아웃을 바꾸지 않으려 button 대신 role="button"
  const handleTaskKeyDown = (e: React.KeyboardEvent, taskId: number, beforeOpen?: () => void) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    beforeOpen?.();
    openTask(taskId);
  };

  return (
    <div ref={containerRef} className={`relative ${viewContainerStyles}`}>
      {/* 헤더 */}
      <div ref={headerRef} className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.4em] text-slate-400">달력</p>
          <p className="mt-1 text-sm text-slate-400">마감일 기준 표시</p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={goToPrevMonth}
            aria-label="이전 달"
            className="min-h-[44px] min-w-[44px] rounded-lg border border-white/10 bg-slate-900/50 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/50"
          >
            ◀
          </button>
          <span className="min-w-[96px] whitespace-nowrap text-center text-sm font-semibold text-white sm:min-w-[120px]">
            {year}년 {month + 1}월
          </span>
          <button
            type="button"
            onClick={goToNextMonth}
            aria-label="다음 달"
            className="min-h-[44px] min-w-[44px] rounded-lg border border-white/10 bg-slate-900/50 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/50"
          >
            ▶
          </button>
          <button
            onClick={goToToday}
            className="min-h-[44px] shrink-0 whitespace-nowrap rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-400 hover:bg-sky-500/20 sm:ml-2"
          >
            오늘
          </button>
        </div>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b border-white/10">
        {WEEKDAYS_KO.map((day, idx) => (
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
          // 멀티 데이 슬롯 높이: 최소 0, 최대 2줄 (더 많으면 날짜별 +N개 표시)
          const displayRows = Math.min(maxRow, CALENDAR_VISIBLE_ROWS);
          const multiDaySlotHeight = displayRows * 20;
          
          return (
            <div key={weekIdx} className="relative">
              {/* 날짜 셀들 */}
              <div className="grid grid-cols-7">
                {weekDates.map((date, dayIdx) => {
                  if (!date) {
                    return (
                      <div
                        key={`empty-${weekIdx}-${dayIdx}`}
                        className="min-h-[80px] sm:min-h-[100px] border-b border-r border-white/5 bg-slate-900/20 p-1"
                      />
                    );
                  }

                  const dateKey = formatDateKey(date);
                  const dayTasks = singleDayTasksByDate.get(dateKey) || [];
                  const hiddenCount = countHiddenTasksForDay(taskBars, dayIdx, dayTasks.length);
                  const isToday = dateKey === todayKey;
                  const isWeekend = isWeekendDate(date);
                  const isCurrentMonth = date.getMonth() === month;

                  return (
                    <div
                      key={dateKey}
                      className={`min-h-[80px] sm:min-h-[100px] border-b border-r border-white/5 p-1 transition ${
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
                        {/* +N개 버튼 - 이 날짜 칸에서 접힌 태스크(단일 초과분 + 밀려난 멀티데이 바)가 있을 때 */}
                        {hiddenCount > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              // 해당 날짜의 모든 태스크 수집 (멀티데이 + 단일데이)
                              const allTasksForDay = [
                                ...dayTasks,
                                ...taskBars.filter(bar => {
                                  // 해당 날짜가 멀티데이 바 범위에 포함되는지 확인
                                  const barStart = weekDates[bar.startCol];
                                  const barEnd = weekDates[bar.startCol + bar.span - 1];
                                  if (!barStart || !barEnd) return false;
                                  return date >= normalizeDate(barStart) && date <= normalizeDate(barEnd);
                                }).map(bar => bar.task)
                              ];
                              // 중복 제거
                              const uniqueTasks = allTasksForDay.filter(
                                (task, idx, arr) => arr.findIndex(t => t.taskId === task.taskId) === idx
                              );
                              handleMoreClick(e, date, uniqueTasks);
                            }}
                            aria-label={`${date.getMonth() + 1}월 ${date.getDate()}일 태스크 ${hiddenCount}개 더 보기`}
                            className="-m-2 shrink-0 whitespace-nowrap p-2 text-[10px] text-sky-400 hover:text-sky-300 hover:underline"
                          >
                            +{hiddenCount}개
                          </button>
                        )}
                      </div>

                      {/* 멀티 데이 태스크 슬롯 영역 - 투명 공간 확보 */}
                      {multiDaySlotHeight > 0 && (
                        <div style={{ height: multiDaySlotHeight }} />
                      )}

                      {/* 단일 데이 태스크 목록 (최대 2개) */}
                      <div className="space-y-1">
                        {dayTasks.slice(0, 2).map(task => {
                          const { status: deadlineStatus } = getTaskDeadlineInfo(task);
                          return (
                            <div
                              key={task.taskId}
                              role="button"
                              tabIndex={0}
                              onClick={e => handleTaskClick(e, task.taskId)}
                              onKeyDown={e => handleTaskKeyDown(e, task.taskId)}
                              className={`cursor-pointer truncate rounded border px-1.5 py-0.5 text-[10px] font-medium text-white transition hover:brightness-110 ${
                                getTaskStatusClassName(task.taskStatus)
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
                
                const { status: deadlineStatus } = getTaskDeadlineInfo(bar.task);
                const leftPercent = (bar.startCol / 7) * 100;
                const widthPercent = (bar.span / 7) * 100;
                // 날짜(28px) + 마진(4px) 이후부터 시작
                const topOffset = 32 + bar.row * 20;
                
                return (
                  <div
                    key={`${bar.task.taskId}-${barIdx}`}
                    className={`absolute cursor-pointer truncate border text-[10px] font-medium text-white transition hover:brightness-110 hover:z-10 ${
                      getTaskStatusClassName(bar.task.taskStatus)
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
                    role="button"
                    tabIndex={0}
                    aria-label={bar.task.taskName}
                    onClick={e => handleTaskClick(e, bar.task.taskId)}
                    onKeyDown={e => handleTaskKeyDown(e, bar.task.taskId)}
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
          <p className="mb-3 text-xs font-semibold text-slate-400">날짜 미지정 ({tasksWithoutDate.length})</p>
          <div className="flex flex-wrap gap-2">
            {tasksWithoutDate.map(task => (
              <div
                key={task.taskId}
                role="button"
                tabIndex={0}
                onClick={e => handleTaskClick(e, task.taskId)}
                onKeyDown={e => handleTaskKeyDown(e, task.taskId)}
                className={`cursor-pointer truncate rounded-lg border px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 ${
                  getTaskStatusClassName(task.taskStatus)
                }`}
                title={task.taskName}
              >
                {task.taskName}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 더보기 팝오버 */}
      {popover.isOpen && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={popover.date ? `${popover.date.getMonth() + 1}월 ${popover.date.getDate()}일 태스크` : '태스크 목록'}
          tabIndex={-1}
          className="absolute z-50 w-64 max-h-80 overflow-y-auto rounded-xl border border-white/10 bg-slate-800/95 shadow-xl focus:outline-none"
          style={{
            top: popover.position.top,
            left: popover.position.left,
            maxHeight: popover.maxHeight,
          }}
        >
          {/* 팝오버 헤더 */}
          <div className="sticky top-0 flex items-center justify-between border-b border-white/10 bg-slate-800/95 px-3 py-2">
            <span className="text-sm font-semibold text-white">
              {popover.date ? `${popover.date.getMonth() + 1}월 ${popover.date.getDate()}일` : ''}
            </span>
            <button
              type="button"
              onClick={closePopover}
              className="rounded p-1 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
              aria-label="닫기"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          
          {/* 태스크 목록 */}
          <div className="p-2 space-y-1.5">
            {popover.tasks.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-4">태스크가 없습니다</p>
            ) : (
              popover.tasks.map(task => {
                const { status: deadlineStatus } = getTaskDeadlineInfo(task);
                return (
                  <div
                    key={task.taskId}
                    role="button"
                    tabIndex={0}
                    onClick={e => {
                      handleTaskClick(e, task.taskId);
                      closePopover();
                    }}
                    onKeyDown={e => handleTaskKeyDown(e, task.taskId, closePopover)}
                    className={`cursor-pointer rounded-lg border px-3 py-2 transition hover:brightness-110 ${
                      getTaskStatusClassName(task.taskStatus)
                    } ${deadlineBorderColors[deadlineStatus]}`}
                  >
                    <p className="text-xs font-medium text-white truncate">{task.taskName}</p>
                    {task.taskDescription && (
                      <p className="mt-0.5 text-[10px] text-white/70 truncate">{task.taskDescription}</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
