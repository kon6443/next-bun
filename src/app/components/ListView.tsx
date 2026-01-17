'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Task } from '../types/task';

type ListViewProps = {
  tasks: Task[];
  teamId: string;
};

type SortKey = 'taskName' | 'taskStatus' | 'userName' | 'startAt' | 'endAt' | 'crtdAt';
type SortOrder = 'asc' | 'desc';

// 상태별 색상 및 라벨
const statusConfig: Record<number, { label: string; className: string }> = {
  1: {
    label: 'Ideation',
    className: 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-400 border-yellow-500/30',
  },
  2: {
    label: 'In Progress',
    className: 'bg-gradient-to-r from-sky-500/20 to-indigo-500/20 text-sky-400 border-sky-500/30',
  },
  3: {
    label: 'Completed',
    className: 'bg-gradient-to-r from-emerald-500/20 to-green-500/20 text-emerald-400 border-emerald-500/30',
  },
};

// 날짜 포맷
function formatDate(date: Date | null): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ListView({ tasks, teamId }: ListViewProps) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>('crtdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [statusFilter, setStatusFilter] = useState<number | null>(null);

  // 필터링 및 정렬된 태스크
  const filteredAndSortedTasks = useMemo(() => {
    let filtered = tasks;

    // 상태 필터링
    if (statusFilter !== null) {
      filtered = filtered.filter(task => task.taskStatus === statusFilter);
    }

    // 정렬
    const sorted = [...filtered].sort((a, b) => {
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
  }, [tasks, sortKey, sortOrder, statusFilter]);

  // 정렬 토글
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  // 정렬 아이콘
  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) {
      return <span className="ml-1 text-slate-600">↕</span>;
    }
    return <span className="ml-1 text-sky-400">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  const handleRowClick = (taskId: number) => {
    router.push(`/teams/${teamId}/tasks/${taskId}`);
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_25px_60px_rgba(15,23,42,0.55)] backdrop-blur-xl">
      <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.4em] text-slate-400">List View</p>
          <p className="mt-1 text-sm text-slate-500">정렬 및 필터링 가능</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">필터:</span>
          <select
            value={statusFilter ?? ''}
            onChange={e => setStatusFilter(e.target.value === '' ? null : Number(e.target.value))}
            className="rounded-lg border border-white/10 bg-slate-900/50 px-3 py-1.5 text-xs text-slate-200 focus:border-white/20 focus:outline-none"
          >
            <option value="">전체 ({tasks.length})</option>
            <option value="1">Ideation ({tasks.filter(t => t.taskStatus === 1).length})</option>
            <option value="2">In Progress ({tasks.filter(t => t.taskStatus === 2).length})</option>
            <option value="3">Completed ({tasks.filter(t => t.taskStatus === 3).length})</option>
          </select>
        </div>
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
            {filteredAndSortedTasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                  표시할 태스크가 없습니다
                </td>
              </tr>
            ) : (
              filteredAndSortedTasks.map(task => {
                const status = statusConfig[task.taskStatus] || statusConfig[1];
                return (
                  <tr
                    key={task.taskId}
                    className="cursor-pointer border-b border-white/5 transition hover:bg-white/5"
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
                      <span className={`inline-block rounded-full border px-2.5 py-1 text-[10px] font-semibold ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {task.userName || `사용자 ${task.crtdBy}`}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {formatDate(task.startAt)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {formatDate(task.endAt)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {formatDate(task.crtdAt)}
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
        {filteredAndSortedTasks.length}개 태스크
        {statusFilter !== null && ` (전체 ${tasks.length}개 중)`}
      </div>
    </div>
  );
}
