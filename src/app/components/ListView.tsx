'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Task } from '../types/task';
import { getDeadlineStatus, getDeadlineLabel, deadlineStyles, formatDateWithYear } from '../utils/taskUtils';
import { getStatusMeta, STATUS_COMPLETED } from '../config/taskStatusConfig';
import { EmptyState } from '../teams/components';
import { ChevronUpIcon, ChevronDownIcon } from './Icons';

type ListViewProps = {
  tasks: Task[];
  teamId: string;
};

type SortKey = 'taskName' | 'taskStatus' | 'userName' | 'startAt' | 'endAt' | 'crtdAt';
type SortOrder = 'asc' | 'desc';

export function ListView({ tasks, teamId }: ListViewProps) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>('crtdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // 정렬된 태스크
  const sortedTasks = useMemo(() => {
    // 정렬
    const sorted = [...tasks].sort((a, b) => {
      let aValue: string | number | Date | null;
      let bValue: string | number | Date | null;

      switch (sortKey) {
        case 'taskName':
          aValue = a.taskName.toLowerCase();
          bValue = b.taskName.toLowerCase();
          break;
        case 'taskStatus':
          aValue = a.taskStatus;
          bValue = b.taskStatus;
          break;
        case 'userName':
          aValue = (a.userName || '').toLowerCase();
          bValue = (b.userName || '').toLowerCase();
          break;
        case 'startAt':
          aValue = a.startAt ? new Date(a.startAt).getTime() : 0;
          bValue = b.startAt ? new Date(b.startAt).getTime() : 0;
          break;
        case 'endAt':
          aValue = a.endAt ? new Date(a.endAt).getTime() : 0;
          bValue = b.endAt ? new Date(b.endAt).getTime() : 0;
          break;
        case 'crtdAt':
          aValue = new Date(a.crtdAt).getTime();
          bValue = new Date(b.crtdAt).getTime();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [tasks, sortKey, sortOrder]);

  // 정렬 토글
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  // 정렬 아이콘 - SVG 아이콘 사용
  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) {
      return (
        <span className="ml-1 inline-flex flex-col text-slate-600">
          <ChevronUpIcon className="w-3 h-3 -mb-1" />
          <ChevronDownIcon className="w-3 h-3" />
        </span>
      );
    }
    return (
      <span className="ml-1 text-sky-400">
        {sortOrder === 'asc' ? (
          <ChevronUpIcon className="w-3 h-3 inline" />
        ) : (
          <ChevronDownIcon className="w-3 h-3 inline" />
        )}
      </span>
    );
  };

  const handleRowClick = (taskId: number) => {
    router.push(`/teams/${teamId}/tasks/${taskId}`);
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_25px_60px_rgba(15,23,42,0.55)] backdrop-blur-xl">
      <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.4em] text-slate-400">List View</p>
          <p className="mt-1 text-sm text-slate-500">컬럼 클릭으로 정렬</p>
        </div>
        <span className="text-xs font-semibold text-slate-400">
          {tasks.length} tasks
        </span>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-white/10">
              <th
                className="cursor-pointer px-4 py-3 text-left text-xs font-semibold text-slate-400 hover:text-slate-200"
                onClick={() => handleSort('taskName')}
              >
                태스크명 <SortIcon columnKey="taskName" />
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left text-xs font-semibold text-slate-400 hover:text-slate-200"
                onClick={() => handleSort('taskStatus')}
              >
                상태 <SortIcon columnKey="taskStatus" />
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left text-xs font-semibold text-slate-400 hover:text-slate-200"
                onClick={() => handleSort('userName')}
              >
                담당자 <SortIcon columnKey="userName" />
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left text-xs font-semibold text-slate-400 hover:text-slate-200"
                onClick={() => handleSort('startAt')}
              >
                시작일 <SortIcon columnKey="startAt" />
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left text-xs font-semibold text-slate-400 hover:text-slate-200"
                onClick={() => handleSort('endAt')}
              >
                마감일 <SortIcon columnKey="endAt" />
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left text-xs font-semibold text-slate-400 hover:text-slate-200"
                onClick={() => handleSort('crtdAt')}
              >
                생성일 <SortIcon columnKey="crtdAt" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedTasks.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState message="표시할 태스크가 없습니다" variant="minimal" />
                </td>
              </tr>
            ) : (
              sortedTasks.map(task => {
                const statusMeta = getStatusMeta(task.taskStatus);
                const deadlineStatus = task.taskStatus !== STATUS_COMPLETED ? getDeadlineStatus(task.endAt) : 'normal';
                const deadlineLabel = getDeadlineLabel(deadlineStatus, task.endAt);
                const showDeadlineAlert = deadlineStatus === 'overdue' || deadlineStatus === 'today' || deadlineStatus === 'soon';

                return (
                  <tr
                    key={task.taskId}
                    className={`cursor-pointer border-b border-white/5 transition hover:bg-white/5 ${deadlineStyles[deadlineStatus].bg}`}
                    onClick={() => handleRowClick(task.taskId)}
                  >
                    <td className="px-4 py-3">
                      <div className="max-w-[200px]">
                        <p className="truncate text-sm font-medium text-slate-200">{task.taskName}</p>
                        {task.taskDescription && (
                          <p className="mt-0.5 truncate text-xs text-slate-500">{task.taskDescription}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusMeta.badgeClassName}`}>
                        {statusMeta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {task.userName || `사용자 ${task.crtdBy}`}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {formatDateWithYear(task.startAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${deadlineStyles[deadlineStatus].text}`}>
                          {formatDateWithYear(task.endAt)}
                        </span>
                        {showDeadlineAlert && (
                          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${deadlineStyles[deadlineStatus].badge}`}>
                            {deadlineLabel}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {formatDateWithYear(task.crtdAt)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 결과 카운트 */}
      <div className="mt-4 text-right text-xs text-slate-500">
        {sortedTasks.length}개 태스크
      </div>
    </div>
  );
}
