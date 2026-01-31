'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Task } from '../types/task';
import { getDeadlineStatus, getDeadlineLabel, deadlineStyles, formatShortDate } from '../utils/taskUtils';
import { type TaskStatusKey } from '../config/taskStatusConfig';
import { StatusDropdown } from './StatusDropdown';

type TaskCardProps = {
  task: Task;
  onStatusChange: (taskId: number, newStatus: number) => Promise<void>;
  teamId: string;
};

export function TaskCard({ task, onStatusChange, teamId }: TaskCardProps) {
  const { taskId, taskName, taskDescription, endAt, userName, crtdBy, taskStatus } = task;
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);

  const endDateStr = formatShortDate(endAt);

  // 현재 상태 키
  const currentStatusKey = taskStatus as TaskStatusKey;

  // 마감일 상태 (완료/취소된 태스크는 표시 안함)
  const deadlineStatus = taskStatus !== 3 && taskStatus !== 5 ? getDeadlineStatus(endAt) : 'normal';
  const deadlineLabel = getDeadlineLabel(deadlineStatus, endAt);
  const showDeadlineAlert = deadlineStatus === 'overdue' || deadlineStatus === 'today' || deadlineStatus === 'soon';

  const handleCardClick = () => {
    router.push(`/teams/${teamId}/tasks/${taskId}`);
  };

  const handleStatusChange = async (newStatus: number, e: React.MouseEvent) => {
    e.stopPropagation(); // 카드 클릭 이벤트 방지
    if (isUpdating) return;

    setIsUpdating(true);
    try {
      await onStatusChange(taskId, newStatus);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <article
      onClick={handleCardClick}
      className="cursor-pointer rounded-2xl border border-white/10 bg-slate-900/60 p-4 shadow-[0_15px_45px_rgba(15,23,42,0.55)] transition-all duration-200 active:scale-[0.98]"
    >
      {/* 마감일 표시 */}
      {(endDateStr || showDeadlineAlert) && (
        <div className="flex items-center justify-end gap-2 text-xs">
          {showDeadlineAlert && (
            <span className={`rounded border px-1.5 py-0.5 text-[0.6rem] font-semibold ${deadlineStyles[deadlineStatus].badge}`}>
              {deadlineLabel}
            </span>
          )}
          {endDateStr && (
            <span className={`text-[0.65rem] font-normal tracking-normal ${deadlineStyles[deadlineStatus].text}`}>
              {endDateStr}
            </span>
          )}
        </div>
      )}

      {/* 태스크 제목 */}
      <h3 className="mt-2 text-base font-semibold text-white line-clamp-2">{taskName}</h3>

      {/* 태스크 설명 */}
      {taskDescription && (
        <p className="mt-2 text-sm leading-relaxed text-slate-400 line-clamp-2 whitespace-pre-wrap">
          {taskDescription}
        </p>
      )}

      {/* 담당자 */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-slate-500 truncate max-w-[60%]">
          {userName || `사용자 ${crtdBy}`}
        </span>
      </div>

      {/* 상태 드롭다운 */}
      <div className="mt-4 pt-3 border-t border-white/5">
        <StatusDropdown
          currentStatus={currentStatusKey}
          onStatusChange={handleStatusChange}
          disabled={isUpdating}
        />
        {/* 로딩 인디케이터 */}
        {isUpdating && (
          <div className="mt-2 text-center">
            <span className="text-xs text-sky-400 animate-pulse">상태 변경 중...</span>
          </div>
        )}
      </div>
    </article>
  );
}
