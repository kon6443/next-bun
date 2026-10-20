'use client';

import { useState, useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Task } from '../types/task';
import { deadlineStyles, formatDateWithYear, getTaskDeadlineInfo } from '../utils/taskUtils';
import { getStatusMeta } from '../config/taskStatusConfig';
import { EmptyState } from '../teams/components';
import { ChevronUpIcon, ChevronDownIcon } from './Icons';
import { viewContainerStyles } from '@/styles/teams';
import { ViewHeader } from './ViewHeader';
import { TaskTagChips } from './TagChip';
import { markTaskOpenedFromBoard, type ListSort, type ListSortKey } from '../utils/boardStateStorage';

type ListViewProps = {
  tasks: Task[];
  teamId: string;
  isArchiveView?: boolean;
  onRestore?: (taskId: number) => Promise<void>;
  /** 처음 정렬 (없으면 생성일 내림차순) — 상세 왕복·보기 전환 후 같은 정렬로 돌아오게 */
  initialSort?: ListSort;
  onSortChange?: (sort: ListSort) => void;
  /** 행의 태그 칩을 누를 때 (보드를 그 태그로 거른다) */
  onTagClick?: (tagId: number) => void;
  /** 빈 목록에 띄울 행동 (예: 새 카드 작성) */
  emptyAction?: ReactNode;
};

type SortKey = ListSortKey;
type SortOrder = ListSort['order'];

export function ListView({ tasks, teamId, isArchiveView, onRestore, initialSort, onSortChange, onTagClick, emptyAction }: ListViewProps) {
  // 복원 열은 헤더·셀·빈 행 colSpan이 같은 조건을 써야 열이 어긋나지 않는다
  const showRestore = Boolean(isArchiveView && onRestore);
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>(initialSort?.key ?? 'crtdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSort?.order ?? 'desc');

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
    const nextOrder: SortOrder = sortKey === key ? (sortOrder === 'asc' ? 'desc' : 'asc') : 'asc';
    setSortKey(key);
    setSortOrder(nextOrder);
    onSortChange?.({ key, order: nextOrder });
  };

  // 정렬 아이콘 - SVG 아이콘 사용 (컴포넌트로 정의하면 렌더마다 새 타입이 되어 매번 다시 마운트된다)
  const renderSortIcon = (columnKey: SortKey) => {
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
    markTaskOpenedFromBoard(teamId, taskId);
    router.push(`/teams/${teamId}/tasks/${taskId}`);
  };

  // 키보드로 행 열기 (Enter 또는 Space). 행 안의 버튼(복원 등)에서 올라온 키는 무시한다
  const handleRowKeyDown = (e: React.KeyboardEvent, taskId: number) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleRowClick(taskId);
    }
  };

  // 정렬 가능한 헤더 — 키보드로 정렬할 수 있게 버튼을 두고, 현재 정렬 상태를 aria-sort 로 알린다
  const renderSortableHeader = (columnKey: SortKey, label: string) => (
    <th
      key={columnKey}
      scope="col"
      aria-sort={sortKey === columnKey ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="px-4 py-3 text-left text-xs font-semibold text-slate-400"
    >
      <button
        type="button"
        onClick={() => handleSort(columnKey)}
        className="inline-flex items-center hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 rounded"
      >
        {label} {renderSortIcon(columnKey)}
      </button>
    </th>
  );

  return (
    <div className={viewContainerStyles}>
      <ViewHeader title="목록" subtitle="컬럼 클릭으로 정렬" count={tasks.length} />

      {/* 태스크가 없으면 표 없이 안내만 — 최소 700px 표 안에 두면 모바일에서 안내·버튼이 화면 밖 가운데에 놓인다 */}
      {sortedTasks.length === 0 ? (
        <EmptyState message="표시할 태스크가 없습니다" variant="minimal" action={emptyAction} />
      ) : (
      /* 테이블 */
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-white/10">
              {renderSortableHeader('taskName', '태스크명')}
              {renderSortableHeader('taskStatus', '상태')}
              {renderSortableHeader('userName', '담당자')}
              {renderSortableHeader('startAt', '시작일')}
              {renderSortableHeader('endAt', '마감일')}
              {renderSortableHeader('crtdAt', '생성일')}
              {showRestore && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">
                  복원
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedTasks.map(task => {
                const statusMeta = getStatusMeta(task.taskStatus);
                const { status: deadlineStatus, label: deadlineLabel, showAlert: showDeadlineAlert } = getTaskDeadlineInfo(task);

                return (
                  <tr
                    key={task.taskId}
                    className={`cursor-pointer border-b border-white/5 transition hover:bg-white/5 focus:outline-none focus:bg-white/10 focus:ring-2 focus:ring-inset focus:ring-sky-500/50 ${deadlineStyles[deadlineStatus].bg}`}
                    onClick={() => handleRowClick(task.taskId)}
                    onKeyDown={(e) => handleRowKeyDown(e, task.taskId)}
                    tabIndex={0}
                  >
                    <td className="px-4 py-3">
                      <div className="max-w-[200px]">
                        <p className="truncate text-sm font-medium text-slate-200">{task.taskName}</p>
                        <TaskTagChips tags={task.tags} max={2} className="mt-1" onTagClick={onTagClick} />
                        {task.taskDescription && (
                          <p className="mt-0.5 truncate text-xs text-slate-400">{task.taskDescription}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusMeta.badgeClassName}`}>
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
                          <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${deadlineStyles[deadlineStatus].badge}`}>
                            {deadlineLabel}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {formatDateWithYear(task.crtdAt)}
                    </td>
                    {showRestore && onRestore && (
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRestore(task.taskId);
                          }}
                          type="button"
                          className="inline-flex min-h-[44px] items-center px-2.5 py-1 rounded-lg text-xs font-medium transition bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                        >
                          복원
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      )}

      {/* 결과 카운트 */}
      <div className="mt-4 text-right text-xs text-slate-400">
        {sortedTasks.length}개 태스크
      </div>
    </div>
  );
}
