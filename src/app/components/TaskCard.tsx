'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Task } from '../types/task';
import { getDeadlineStatus, getDeadlineLabel, deadlineStyles } from '../utils/taskUtils';
import {
  TASK_STATUS,
  type TaskStatusKey,
} from '../config/taskStatusConfig';

type TaskCardProps = {
  task: Task;
  onStatusChange: (taskId: number, newStatus: number) => Promise<void>;
  teamId: string;
};

export function TaskCard({ task, onStatusChange, teamId }: TaskCardProps) {
  const { taskId, taskName, taskDescription, endAt, userName, crtdBy, taskStatus } = task;
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);

  const formatDate = (date: Date | null) => {
    if (!date) return null;
    const d = new Date(date);
    return d.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
    });
  };

  const endDateStr = endAt ? formatDate(endAt) : null;

  // 현재 상태 메타데이터
  const currentStatusKey = taskStatus as TaskStatusKey;
  const currentStatusMeta = TASK_STATUS[currentStatusKey] || TASK_STATUS[1];

  // 마감일 상태 (완료/취소된 태스크는 표시 안함)
  const deadlineStatus = taskStatus !== 3 && taskStatus !== 5 ? getDeadlineStatus(endAt) : 'normal';
  const deadlineLabel = getDeadlineLabel(deadlineStatus, endAt);
  const showDeadlineAlert = deadlineStatus === 'overdue' || deadlineStatus === 'today' || deadlineStatus === 'soon';

  // 현재 상태를 제외한 모든 상태 가져오기
  const otherStatuses = Object.values(TASK_STATUS).filter(s => s.key !== currentStatusKey);

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

      {/* 상태 변경 버튼 그룹 */}
      <div className="mt-4 pt-3 border-t border-white/5">
        {/* 현재 상태 표시 */}
        <div className="flex items-center gap-2 mb-2">
          <span
            className="w-3 h-3 rounded-full border border-white/20"
            style={{ background: currentStatusMeta.accent }}
            aria-hidden="true"
          />
          <span className="text-xs font-semibold text-slate-400">
            {currentStatusMeta.label}
          </span>
        </div>

        {/* 다른 상태로 변경 버튼들 */}
        <div className="flex flex-wrap gap-2">
          {otherStatuses.map((status) => (
            <button
              key={status.key}
              onClick={(e) => handleStatusChange(status.key, e)}
              disabled={isUpdating}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 ${status.badgeClassName} border hover:brightness-110 disabled:opacity-50`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: status.accent }}
                aria-hidden="true"
              />
              {status.shortLabel}
            </button>
          ))}
        </div>

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
