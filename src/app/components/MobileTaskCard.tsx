'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Task } from '../types/task';
import { getDeadlineStatus, getDeadlineLabel, deadlineStyles } from '../utils/taskUtils';
import {
  TASK_STATUS,
  getNextWorkflowStatus,
  getPrevWorkflowStatus,
  type TaskStatusKey,
} from '../config/taskStatusConfig';

type MobileTaskCardProps = {
  task: Task;
  onStatusChange: (taskId: number, newStatus: number) => Promise<void>;
  teamId: string;
};

export function MobileTaskCard({ task, onStatusChange, teamId }: MobileTaskCardProps) {
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

  // 마감일 상태 (완료된 태스크는 표시 안함)
  const deadlineStatus = taskStatus !== 3 ? getDeadlineStatus(endAt) : 'normal';
  const deadlineLabel = getDeadlineLabel(deadlineStatus, endAt);
  const showDeadlineAlert = deadlineStatus === 'overdue' || deadlineStatus === 'today' || deadlineStatus === 'soon';

  // 워크플로우 기반 이전/다음 상태 가져오기
  const prevStatus = getPrevWorkflowStatus(currentStatusKey);
  const nextStatus = getNextWorkflowStatus(currentStatusKey);

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

      {/* 퀵 액션 버튼 (상태 변경) */}
      <div className="mt-4 pt-3 border-t border-white/5">
        <div className="flex items-center gap-2">
          {/* 이전 상태로 버튼 */}
          <button
            onClick={(e) => prevStatus && handleStatusChange(prevStatus.key, e)}
            disabled={!prevStatus || isUpdating}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              prevStatus
                ? 'bg-slate-800/80 text-slate-300 border border-white/10 hover:bg-slate-700/80 active:scale-95'
                : 'bg-slate-900/30 text-slate-600 border border-transparent cursor-not-allowed'
            }`}
          >
            {prevStatus ? (
              <span className="flex items-center justify-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {prevStatus.shortLabel}
              </span>
            ) : (
              <span className="opacity-50">-</span>
            )}
          </button>

          {/* 현재 상태 표시 */}
          <div className="px-2 py-1 text-[10px] font-semibold text-slate-500 bg-slate-800/50 rounded">
            {currentStatusMeta.label}
          </div>

          {/* 다음 상태로 버튼 */}
          <button
            onClick={(e) => nextStatus && handleStatusChange(nextStatus.key, e)}
            disabled={!nextStatus || isUpdating}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              nextStatus
                ? 'bg-gradient-to-r from-indigo-500/20 to-sky-500/20 text-sky-400 border border-sky-500/30 hover:from-indigo-500/30 hover:to-sky-500/30 active:scale-95'
                : 'bg-slate-900/30 text-slate-600 border border-transparent cursor-not-allowed'
            }`}
          >
            {nextStatus ? (
              <span className="flex items-center justify-center gap-1">
                {nextStatus.shortLabel}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            ) : (
              <span className="opacity-50">-</span>
            )}
          </button>
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
