'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Task } from '../types/task';

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

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 날짜 키 생성 (YYYY-MM-DD)
function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 월의 첫 날과 마지막 날 계산
function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  return { firstDay, lastDay };
}

// 캘린더 그리드 생성
function generateCalendarGrid(year: number, month: number) {
  const { firstDay, lastDay } = getMonthDays(year, month);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const grid: (Date | null)[] = [];

  // 이전 달의 빈 칸
  for (let i = 0; i < startDayOfWeek; i++) {
    grid.push(null);
  }

  // 현재 달의 날짜
  for (let day = 1; day <= daysInMonth; day++) {
    grid.push(new Date(year, month, day));
  }

  // 다음 달의 빈 칸 (6주 고정)
  while (grid.length < 42) {
    grid.push(null);
  }

  return grid;
}

export function CalendarView({ tasks, teamId }: CalendarViewProps) {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // 캘린더 그리드
  const calendarGrid = useMemo(() => generateCalendarGrid(year, month), [year, month]);

  // 마감일 기준으로 태스크 그룹화
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();

    tasks.forEach(task => {
      if (task.endAt) {
        const key = getDateKey(new Date(task.endAt));
        const existing = map.get(key) || [];
        map.set(key, [...existing, task]);
      }
    });

    return map;
  }, [tasks]);

  // 마감일 없는 태스크
  const tasksWithoutEndDate = useMemo(() => {
    return tasks.filter(task => !task.endAt);
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

      {/* 캘린더 그리드 */}
      <div className="grid grid-cols-7">
        {calendarGrid.map((date, idx) => {
          if (!date) {
            return (
              <div
                key={`empty-${idx}`}
                className="min-h-[100px] border-b border-r border-white/5 bg-slate-900/20 p-1"
              />
            );
          }

          const dateKey = getDateKey(date);
          const dayTasks = tasksByDate.get(dateKey) || [];
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
                {dayTasks.length > 3 && (
                  <span className="text-[10px] text-slate-500">+{dayTasks.length - 3}</span>
                )}
              </div>

              {/* 태스크 목록 (최대 3개) */}
              <div className="space-y-1">
                {dayTasks.slice(0, 3).map(task => (
                  <div
                    key={task.taskId}
                    onClick={e => handleTaskClick(e, task.taskId)}
                    className={`cursor-pointer truncate rounded border px-1.5 py-0.5 text-[10px] font-medium text-white transition hover:brightness-110 ${
                      statusColors[task.taskStatus] || statusColors[1]
                    }`}
                    title={task.taskName}
                  >
                    {task.taskName}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 마감일 없는 태스크 */}
      {tasksWithoutEndDate.length > 0 && (
        <div className="mt-6">
          <p className="mb-3 text-xs font-semibold text-slate-500">마감일 미지정 ({tasksWithoutEndDate.length})</p>
          <div className="flex flex-wrap gap-2">
            {tasksWithoutEndDate.map(task => (
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
