'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Task } from '../types/task';
import { getDeadlineStatus, getDeadlineLabel, deadlineStyles, formatDateKey, formatDateDisplay } from '../utils/taskUtils';
import { getStatusMeta, STATUS_COMPLETED } from '../config/taskStatusConfig';
import { EmptyState } from '../teams/components';

type GanttChartProps = {
  tasks: Task[];
  teamId: string;
};

// taskStatusConfig에서 스타일 가져오기 헬퍼
function getStatusColors(taskStatus: number): { bg: string; border: string } {
  const meta = getStatusMeta(taskStatus);
  return { bg: meta.bgClassName, border: meta.borderClassName };
}

function getStatusLabel(taskStatus: number): string {
  return getStatusMeta(taskStatus).label;
}

function getStatusTextColor(taskStatus: number): string {
  const meta = getStatusMeta(taskStatus);
  // badgeClassName에서 text-* 클래스 추출
  const textMatch = meta.badgeClassName.match(/text-(\w+)-\d+/);
  return textMatch ? `text-${textMatch[1]}-400` : 'text-slate-400';
}

// 두 날짜 사이의 일수 계산
function daysBetween(start: Date, end: Date): number {
  const startTime = new Date(start).setHours(0, 0, 0, 0);
  const endTime = new Date(end).setHours(0, 0, 0, 0);
  return Math.ceil((endTime - startTime) / (1000 * 60 * 60 * 24));
}

// 날짜 범위 생성
function generateDateRange(start: Date, end: Date): Date[] {
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

export function GanttChart({ tasks, teamId }: GanttChartProps) {
  const router = useRouter();

  // 태스크 정렬: 시작일 있는 것 먼저 (오름차순), 없는 것은 하단에 (생성일 기준)
  const sortedTasks = useMemo(() => {
    const withStartDate = tasks
      .filter(task => task.startAt !== null)
      .sort((a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime());

    const withoutStartDate = tasks
      .filter(task => task.startAt === null)
      .sort((a, b) => new Date(a.crtdAt).getTime() - new Date(b.crtdAt).getTime());

    return { withStartDate, withoutStartDate };
  }, [tasks]);

  // 날짜 범위 계산 (시작일이 있는 태스크 기준)
  const dateRange = useMemo(() => {
    const allTasks = sortedTasks.withStartDate;
    if (allTasks.length === 0) {
      // 기본값: 오늘부터 14일
      const today = new Date();
      const twoWeeksLater = new Date(today);
      twoWeeksLater.setDate(today.getDate() + 13);
      return generateDateRange(today, twoWeeksLater);
    }

    // 최소 시작일, 최대 종료일 찾기
    let minDate = new Date(allTasks[0].startAt!);
    let maxDate = new Date(allTasks[0].startAt!);

    allTasks.forEach(task => {
      const start = new Date(task.startAt!);
      if (start < minDate) minDate = start;

      const end = task.endAt ? new Date(task.endAt) : start;
      if (end > maxDate) maxDate = end;
    });

    // 앞뒤로 여유 추가 (3일씩)
    minDate.setDate(minDate.getDate() - 3);
    maxDate.setDate(maxDate.getDate() + 3);

    // 최소 14일 보장
    const days = daysBetween(minDate, maxDate);
    if (days < 14) {
      maxDate.setDate(maxDate.getDate() + (14 - days));
    }

    return generateDateRange(minDate, maxDate);
  }, [sortedTasks.withStartDate]);

  const handleTaskClick = (taskId: number) => {
    router.push(`/teams/${teamId}/tasks/${taskId}`);
  };

  // 태스크의 막대 위치 및 너비 계산
  const getBarStyle = (task: Task) => {
    if (!task.startAt) return null;

    const startDate = new Date(task.startAt);
    const endDate = task.endAt ? new Date(task.endAt) : startDate;
    const rangeStart = dateRange[0];

    const startOffset = daysBetween(rangeStart, startDate);
    const duration = Math.max(1, daysBetween(startDate, endDate) + 1);

    const cellWidth = 60; // 각 날짜 셀의 너비 (px)
    const left = startOffset * cellWidth;
    const width = duration * cellWidth;

    return { left, width };
  };

  const cellWidth = 60;
  const totalWidth = dateRange.length * cellWidth;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_25px_60px_rgba(15,23,42,0.55)] backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.4em] text-slate-400">Timeline</p>
          <p className="mt-1 text-sm text-slate-500">시작일 기준 정렬</p>
        </div>
        <span className="text-xs font-semibold text-slate-400">
          {tasks.length} tasks
        </span>
      </div>

      {/* 간트 차트 영역 */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: totalWidth + 200 }}>
          {/* 날짜 헤더 */}
          <div className="flex border-b border-white/10">
            <div className="w-[200px] flex-shrink-0 px-3 py-2">
              <span className="text-xs font-semibold text-slate-400">태스크</span>
            </div>
            <div className="flex">
              {dateRange.map((date, idx) => {
                const isToday = formatDateKey(date) === formatDateKey(new Date());
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                return (
                  <div
                    key={idx}
                    className={`flex-shrink-0 border-l border-white/5 px-1 py-2 text-center ${
                      isToday ? 'bg-sky-500/20' : isWeekend ? 'bg-slate-800/30' : ''
                    }`}
                    style={{ width: cellWidth }}
                  >
                    <span className={`text-[10px] ${isToday ? 'font-bold text-sky-400' : 'text-slate-500'}`}>
                      {formatDateDisplay(date)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 시작일이 있는 태스크 */}
          {sortedTasks.withStartDate.length > 0 && (
            <div className="border-b border-white/10">
              {sortedTasks.withStartDate.map(task => {
                const barStyle = getBarStyle(task);
                const colors = getStatusColors(task.taskStatus);
                const deadlineStatus = task.taskStatus !== STATUS_COMPLETED ? getDeadlineStatus(task.endAt) : 'normal';
                const deadlineLabel = getDeadlineLabel(deadlineStatus, task.endAt);
                const showDeadlineAlert = deadlineStatus === 'overdue' || deadlineStatus === 'today' || deadlineStatus === 'soon';

                return (
                  <div key={task.taskId} className={`group flex items-center hover:bg-white/5 ${deadlineStyles[deadlineStatus].bg}`}>
                    {/* 태스크 이름 */}
                    <div
                      className="w-[200px] flex-shrink-0 cursor-pointer truncate px-3 py-3"
                      onClick={() => handleTaskClick(task.taskId)}
                    >
                      <span className="text-sm font-medium text-slate-200 group-hover:text-white">
                        {task.taskName}
                      </span>
                      <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] ${getStatusTextColor(task.taskStatus)}`}>
                          {getStatusLabel(task.taskStatus)}
                        </span>
                        {showDeadlineAlert && (
                          <span className={`rounded border px-1 py-0.5 text-[9px] font-semibold ${deadlineStyles[deadlineStatus].badge}`}>
                            {deadlineLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 타임라인 영역 */}
                    <div className="relative h-12 flex-1">
                      {/* 그리드 라인 */}
                      <div className="absolute inset-0 flex">
                        {dateRange.map((date, idx) => {
                          const isToday = formatDateKey(date) === formatDateKey(new Date());
                          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                          return (
                            <div
                              key={idx}
                              className={`flex-shrink-0 border-l border-white/5 ${
                                isToday ? 'bg-sky-500/10' : isWeekend ? 'bg-slate-800/20' : ''
                              }`}
                              style={{ width: cellWidth }}
                            />
                          );
                        })}
                      </div>

                      {/* 막대 */}
                      {barStyle && (
                        <div
                          className={`absolute top-2 h-8 cursor-pointer rounded-lg border ${colors.bg} ${colors.border} shadow-lg transition-all hover:scale-y-110 hover:brightness-110`}
                          style={{
                            left: barStyle.left,
                            width: Math.max(barStyle.width - 4, 20),
                          }}
                          onClick={() => handleTaskClick(task.taskId)}
                          title={`${task.taskName}\n${task.startAt ? new Date(task.startAt).toLocaleDateString('ko-KR') : ''} ~ ${task.endAt ? new Date(task.endAt).toLocaleDateString('ko-KR') : ''}`}
                        >
                          <span className="absolute inset-0 flex items-center justify-center overflow-hidden px-2 text-[10px] font-semibold text-white drop-shadow truncate">
                            {task.taskName}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 시작일이 없는 태스크 */}
          {sortedTasks.withoutStartDate.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 px-3">
                <span className="text-xs font-semibold text-slate-500">날짜 미지정</span>
              </div>
              {sortedTasks.withoutStartDate.map(task => {
                const colors = getStatusColors(task.taskStatus);
                const deadlineStatus = task.taskStatus !== STATUS_COMPLETED ? getDeadlineStatus(task.endAt) : 'normal';
                const deadlineLabel = getDeadlineLabel(deadlineStatus, task.endAt);
                const showDeadlineAlert = deadlineStatus === 'overdue' || deadlineStatus === 'today' || deadlineStatus === 'soon';

                return (
                  <div key={task.taskId} className={`group flex items-center hover:bg-white/5 ${deadlineStyles[deadlineStatus].bg}`}>
                    <div
                      className="w-[200px] flex-shrink-0 cursor-pointer truncate px-3 py-3"
                      onClick={() => handleTaskClick(task.taskId)}
                    >
                      <span className="text-sm font-medium text-slate-200 group-hover:text-white">
                        {task.taskName}
                      </span>
                      <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] ${getStatusTextColor(task.taskStatus)}`}>
                          {getStatusLabel(task.taskStatus)}
                        </span>
                        {showDeadlineAlert && (
                          <span className={`rounded border px-1 py-0.5 text-[9px] font-semibold ${deadlineStyles[deadlineStatus].badge}`}>
                            {deadlineLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 날짜 미지정 표시 */}
                    <div className="relative h-12 flex-1">
                      <div className="absolute inset-0 flex">
                        {dateRange.map((_, idx) => (
                          <div
                            key={idx}
                            className="flex-shrink-0 border-l border-white/5 bg-slate-900/30"
                            style={{ width: cellWidth }}
                          />
                        ))}
                      </div>
                      <div className="absolute left-4 top-2 flex h-8 items-center">
                        <span className={`rounded-lg border px-3 py-1 text-[10px] font-medium ${colors.border} bg-slate-800/50 text-slate-400`}>
                          시작일 미설정
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 태스크가 없는 경우 */}
          {tasks.length === 0 && (
            <EmptyState message="표시할 태스크가 없습니다" variant="dashed" />
          )}
        </div>
      </div>
    </div>
  );
}
