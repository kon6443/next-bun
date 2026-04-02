'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Task } from '../types/task';
import { getDeadlineStatus, getDeadlineLabel, getArchiveDaysLeft, deadlineStyles, formatCompactDateTime } from '../utils/taskUtils';
import { type TaskStatusKey, STATUS_COMPLETED, STATUS_CANCELLED } from '../config/taskStatusConfig';
import { StatusDropdown } from './StatusDropdown';
import { ConfirmModal } from './ConfirmModal';
import { ArchiveIcon, RestoreIcon } from './Icons';
import { DateInfoInline } from '../teams/components';

type TaskCardProps = {
  task: Task;
  onStatusChange: (taskId: number, newStatus: number) => Promise<void>;
  teamId: string;
  isArchiveView?: boolean;
  onRestore?: (taskId: number) => Promise<void>;
  onArchive?: (taskId: number) => Promise<void>;
};

export function TaskCard({ task, onStatusChange, teamId, isArchiveView, onRestore, onArchive }: TaskCardProps) {
  const { taskId, taskName, taskDescription, startAt, endAt, crtdAt, userName, crtdBy, taskStatus } = task;
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // 마감일 표시용 포맷팅 (상단 배지)
  const endDateStr = endAt ? formatCompactDateTime(endAt) : null;

  // 현재 상태 키
  const currentStatusKey = taskStatus as TaskStatusKey;

  // 마감일 상태 (완료/취소된 태스크는 표시 안함)
  const deadlineStatus = taskStatus !== STATUS_COMPLETED && taskStatus !== STATUS_CANCELLED ? getDeadlineStatus(endAt) : 'normal';
  const deadlineLabel = getDeadlineLabel(deadlineStatus, endAt);
  const showDeadlineAlert = deadlineStatus === 'overdue' || deadlineStatus === 'today' || deadlineStatus === 'soon';

  // 자동 아카이브 예정 배지
  const archiveDaysLeft = getArchiveDaysLeft(task);

  const handleCardClick = () => {
    router.push(`/teams/${teamId}/tasks/${taskId}`);
  };

  // 키보드로 카드 선택 (Enter 또는 Space)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick();
    }
  };

  const handleStatusChange = async (newStatus: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isUpdating) return;

    setIsUpdating(true);
    try {
      await onStatusChange(taskId, newStatus);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleArchiveConfirm = async () => {
    if (!onArchive || isUpdating) return;
    setIsUpdating(true);
    try {
      await onArchive(taskId);
    } finally {
      setIsUpdating(false);
      setShowArchiveConfirm(false);
    }
  };

  return (
    <>
      <article
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-label={`태스크: ${taskName}${showDeadlineAlert ? `, ${deadlineLabel}` : ''}. 클릭하여 상세보기`}
        className="cursor-pointer rounded-2xl border border-white/10 bg-slate-900/60 p-4 shadow-[0_15px_45px_rgba(15,23,42,0.55)] transition-all duration-200 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-sky-500/50"
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

        {/* 자동 아카이브 예정 배지 */}
        {archiveDaysLeft !== null && (
          <div className="mt-1.5">
            <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[0.6rem] font-medium text-amber-400">
              <ArchiveIcon className="w-3 h-3" />
              {archiveDaysLeft === 0 ? '오늘 자동 보관' : `${archiveDaysLeft}일 후 자동 보관`}
            </span>
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

        {/* 날짜 정보: 생성일 · 시작일 → 종료일 */}
        <div className="mt-2">
          <DateInfoInline crtdAt={crtdAt} startAt={startAt} endAt={endAt} size="sm" />
        </div>

        {/* 상태 드롭다운 + 보관/복원 아이콘 (한 줄) */}
        <div className="mt-4 pt-3 border-t border-white/5">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <StatusDropdown
                currentStatus={currentStatusKey}
                onStatusChange={handleStatusChange}
                disabled={isUpdating}
              />
            </div>
            {/* 활성 탭: 보관 아이콘 / 보관함 탭: 복원 아이콘 */}
            {isArchiveView && onRestore ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isUpdating) {
                    setIsUpdating(true);
                    onRestore(taskId).finally(() => setIsUpdating(false));
                  }
                }}
                disabled={isUpdating}
                title="활성으로 복원"
                className="p-2.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition disabled:opacity-50"
              >
                <RestoreIcon className="w-4 h-4" />
              </button>
            ) : onArchive ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowArchiveConfirm(true);
                }}
                disabled={isUpdating}
                title="보관함으로 이동"
                className="p-2.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition disabled:opacity-50"
              >
                <ArchiveIcon className="w-4 h-4" />
              </button>
            ) : null}
          </div>
          {isUpdating && (
            <div className="mt-2 text-center" role="status" aria-live="polite">
              <span className="text-xs text-sky-400 animate-pulse">처리 중...</span>
            </div>
          )}
        </div>
      </article>

      {/* 보관 확인 모달 */}
      <ConfirmModal
        isOpen={showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(false)}
        onConfirm={handleArchiveConfirm}
        title="보관함으로 이동"
        message={`"${taskName}" 태스크를 보관함으로 이동하시겠습니까? 보관함 탭에서 다시 복원할 수 있습니다.`}
        confirmLabel="보관함으로 이동"
        isLoading={isUpdating}
      />
    </>
  );
}
