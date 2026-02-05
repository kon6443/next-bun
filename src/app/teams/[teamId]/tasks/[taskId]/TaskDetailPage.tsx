'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import {
  getTaskDetail,
  createTaskComment,
  updateTaskComment,
  deleteTaskComment,
  updateTask,
  updateTaskStatus,
  type TaskDetailResponse,
} from '@/services/teamService';
import type { TaskComment } from '@/app/types/task';
import {
  TeamsPageLayout,
  Button,
  ButtonLink,
  SectionLabel,
  TaskForm,
  ErrorAlert,
  SuccessAlert,
  Skeleton,
  SkeletonText,
  DateInfoInline,
  type TaskFormData,
} from '../../../components';
import { StatusDropdown } from '@/app/components/StatusDropdown';
import { EditIcon, TrashIcon, CommentIcon, SendIcon } from '@/app/components/Icons';
import { formatCompactDateTime } from '@/app/utils/taskUtils';
import type { TaskStatusKey } from '@/app/config/taskStatusConfig';
import { cardStyles } from '@/styles/teams';
import { useTeamTaskId, useTeamSocketEvents } from '@/app/hooks';
import { useTeamSocketContext } from '../../contexts';
import type {
  TaskUpdatedPayload,
  TaskStatusChangedPayload,
  CommentCreatedPayload,
  CommentUpdatedPayload,
  CommentDeletedPayload,
} from '@/types/socket';

type TaskDetailPageProps = {
  teamId: string;
  taskId: string;
};

export default function TaskDetailPage({ teamId, taskId }: TaskDetailPageProps) {
  const { data: session, status: sessionStatus } = useSession();
  const [taskDetail, setTaskDetail] = useState<TaskDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isStatusUpdating, setIsStatusUpdating] = useState(false);

  // 각 작업별 독립적인 로딩 상태 (하나의 작업이 다른 작업을 블로킹하지 않음)
  const [isUpdatingTask, setIsUpdatingTask] = useState(false);
  const [isCreatingComment, setIsCreatingComment] = useState(false);
  const [isUpdatingComment, setIsUpdatingComment] = useState(false);
  const [isDeletingComment, setIsDeletingComment] = useState(false);

  // useTeamTaskId 훅으로 ID 파싱 통합
  const { teamIdNum, taskIdNum, isValid: isValidIds } = useTeamTaskId(teamId, taskId);

  // 댓글 목록 (taskDetail에서 직접 참조)
  const comments = taskDetail?.comments ?? [];

  // ===== WebSocket (Context에서 관리) =====
  const { socket } = useTeamSocketContext();

  // Socket 이벤트 핸들러: 태스크 수정
  const handleSocketTaskUpdated = useCallback(
    (payload: TaskUpdatedPayload) => {
      // 다른 태스크의 이벤트는 무시
      if (payload.taskId !== taskIdNum) return;

      setTaskDetail(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          ...(payload.taskName !== undefined && { taskName: payload.taskName }),
          ...(payload.taskDescription !== undefined && { taskDescription: payload.taskDescription }),
          ...(payload.startAt !== undefined && { startAt: payload.startAt ? new Date(payload.startAt) : null }),
          ...(payload.endAt !== undefined && { endAt: payload.endAt ? new Date(payload.endAt) : null }),
        };
      });
      toast.success('태스크 정보가 업데이트되었습니다.');
    },
    [taskIdNum],
  );

  // Socket 이벤트 핸들러: 태스크 상태 변경
  const handleSocketTaskStatusChanged = useCallback(
    (payload: TaskStatusChangedPayload) => {
      if (payload.taskId !== taskIdNum) return;

      setTaskDetail(prev => {
        if (!prev) return prev;
        return { ...prev, taskStatus: payload.newStatus };
      });
      toast.success('태스크 상태가 변경되었습니다.');
    },
    [taskIdNum],
  );

  // Socket 이벤트 핸들러: 댓글 생성
  const handleSocketCommentCreated = useCallback(
    (payload: CommentCreatedPayload) => {
      if (payload.taskId !== taskIdNum) return;

      const newComment: TaskComment = {
        commentId: payload.commentId,
        teamId: payload.teamId,
        taskId: payload.taskId,
        userId: payload.userId,
        userName: payload.userName,
        commentContent: payload.commentContent,
        status: 1,
        mdfdAt: null,
        crtdAt: new Date(payload.crtdAt),
      };

      setTaskDetail(prev => {
        if (!prev) return prev;
        return { ...prev, comments: [...prev.comments, newComment] };
      });
      toast.success('새 댓글이 추가되었습니다.');
    },
    [taskIdNum],
  );

  // Socket 이벤트 핸들러: 댓글 수정
  const handleSocketCommentUpdated = useCallback(
    (payload: CommentUpdatedPayload) => {
      if (payload.taskId !== taskIdNum) return;

      setTaskDetail(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          comments: prev.comments.map(comment =>
            comment.commentId === payload.commentId
              ? {
                  ...comment,
                  commentContent: payload.commentContent,
                  mdfdAt: new Date(payload.mdfdAt),
                }
              : comment,
          ),
        };
      });
      toast.success('댓글이 수정되었습니다.');
    },
    [taskIdNum],
  );

  // Socket 이벤트 핸들러: 댓글 삭제
  const handleSocketCommentDeleted = useCallback(
    (payload: CommentDeletedPayload) => {
      if (payload.taskId !== taskIdNum) return;

      setTaskDetail(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          comments: prev.comments.map(comment =>
            comment.commentId === payload.commentId ? { ...comment, status: 0 } : comment,
          ),
        };
      });
      toast.success('댓글이 삭제되었습니다.');
    },
    [taskIdNum],
  );

  // Socket 이벤트 리스너 등록
  useTeamSocketEvents(
    socket,
    {
      onTaskUpdated: handleSocketTaskUpdated,
      onTaskStatusChanged: handleSocketTaskStatusChanged,
      onCommentCreated: handleSocketCommentCreated,
      onCommentUpdated: handleSocketCommentUpdated,
      onCommentDeleted: handleSocketCommentDeleted,
    },
    session?.user?.userId,
  );

  const fetchTaskDetail = useCallback(
    async (showLoading = true) => {
      // 세션이 아직 로딩 중이면 기다림
      if (sessionStatus === 'loading') {
        return;
      }

      if (!session?.user?.accessToken) {
        setError('인증이 필요합니다. 다시 로그인해주세요.');
        if (showLoading) setIsLoading(false);
        return;
      }

      if (!isValidIds) {
        setError('유효하지 않은 팀 ID 또는 태스크 ID입니다.');
        if (showLoading) setIsLoading(false);
        return;
      }

      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);
      try {
        const response = await getTaskDetail(teamIdNum, taskIdNum, session.user.accessToken);

        // 날짜 변환
        const taskData = {
          ...response.data,
          startAt: response.data.startAt ? new Date(response.data.startAt) : null,
          endAt: response.data.endAt ? new Date(response.data.endAt) : null,
          crtdAt: new Date(response.data.crtdAt),
          comments: response.data.comments.map(comment => ({
            ...comment,
            crtdAt: new Date(comment.crtdAt),
            mdfdAt: comment.mdfdAt ? new Date(comment.mdfdAt) : null,
          })),
        };

        setTaskDetail(taskData);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : '태스크 상세 정보를 불러오는데 실패했습니다.';
        setError(errorMessage);
        console.error('Failed to fetch task detail:', err);
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
      }
    },
    [teamIdNum, taskIdNum, isValidIds, session?.user?.accessToken, sessionStatus],
  );

  useEffect(() => {
    fetchTaskDetail();
  }, [fetchTaskDetail]);

  // 상태 변경 핸들러
  const handleStatusChange = async (newStatus: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isStatusUpdating || !session?.user?.accessToken || !taskDetail || !isValidIds) return;

    setIsStatusUpdating(true);
    setError(null);
    try {
      await updateTaskStatus(teamIdNum, taskIdNum, newStatus, session.user.accessToken);
      await fetchTaskDetail(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '상태 변경에 실패했습니다.';
      setError(errorMessage);
    } finally {
      setIsStatusUpdating(false);
    }
  };

  // 수정 모드 시작
  const handleStartEdit = () => {
    if (!taskDetail) return;
    setIsEditing(true);
    setError(null);
  };

  // 수정 모드 취소
  const handleCancelEdit = () => {
    setIsEditing(false);
    setError(null);
  };

  // 태스크 수정
  const handleUpdateTask = async (data: TaskFormData) => {
    if (!taskDetail || !session?.user?.accessToken || !isValidIds) return;

    setIsUpdatingTask(true);
    setError(null);

    try {
      await updateTask(
        teamIdNum,
        taskIdNum,
        {
          taskName: data.taskName,
          taskDescription: data.taskDescription,
          startAt: data.startAt ? `${data.startAt}T00:00:00` : null,
          endAt: data.endAt ? `${data.endAt}T23:59:59` : null,
        },
        session.user.accessToken,
      );

      setIsEditing(false);
      await fetchTaskDetail(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '태스크 수정에 실패했습니다.';
      setError(errorMessage);
      console.error('Failed to update task:', err);
    } finally {
      setIsUpdatingTask(false);
    }
  };

  const handleCreateComment = async () => {
    if (!newComment.trim() || !session?.user?.accessToken || !isValidIds) return;

    setIsCreatingComment(true);
    try {
      await createTaskComment(
        teamIdNum,
        taskIdNum,
        { commentContent: newComment.trim() },
        session.user.accessToken,
      );

      setNewComment('');
      setError(null);
      setSuccessMessage('댓글이 작성되었습니다.');
      await fetchTaskDetail(false);

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '댓글 작성에 실패했습니다.';
      setError(errorMessage);
      setSuccessMessage(null);
      console.error('Failed to create comment:', err);
    } finally {
      setIsCreatingComment(false);
    }
  };

  const handleStartEditComment = (comment: TaskComment) => {
    setEditingCommentId(comment.commentId);
    setEditingContent(comment.commentContent);
  };

  const handleCancelEditComment = () => {
    setEditingCommentId(null);
    setEditingContent('');
  };

  const handleUpdateComment = async (commentId: number) => {
    if (!editingContent.trim() || !session?.user?.accessToken || !isValidIds) return;

    setIsUpdatingComment(true);
    try {
      await updateTaskComment(
        teamIdNum,
        taskIdNum,
        commentId,
        { commentContent: editingContent.trim() },
        session.user.accessToken,
      );

      setEditingCommentId(null);
      setEditingContent('');
      await fetchTaskDetail(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '댓글 수정에 실패했습니다.';
      setError(errorMessage);
      console.error('Failed to update comment:', err);
    } finally {
      setIsUpdatingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!session?.user?.accessToken || !isValidIds) return;
    if (!confirm('댓글을 삭제하시겠습니까?')) return;

    setIsDeletingComment(true);
    setError(null);
    try {
      await deleteTaskComment(teamIdNum, taskIdNum, commentId, session.user.accessToken);

      try {
        await fetchTaskDetail(false);
      } catch (refreshErr) {
        console.warn('Failed to refresh task detail after delete:', refreshErr);
        setError('댓글이 삭제되었지만 목록을 새로고침하지 못했습니다. 페이지를 새로고침해주세요.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '댓글 삭제에 실패했습니다.';
      setError(errorMessage);
      console.error('Failed to delete comment:', { err, commentId, teamIdNum, taskIdNum });
    } finally {
      setIsDeletingComment(false);
    }
  };

  if (isLoading) {
    return (
      <TeamsPageLayout>
        {/* 뒤로가기 버튼 스켈레톤 */}
        <div className='flex items-center justify-between'>
          <Skeleton width="180px" height="2.5rem" rounded="full" />
        </div>

        {/* 태스크 상세 스켈레톤 */}
        <section className={`${cardStyles.section} p-4`}>
          <div className='flex items-start justify-between gap-3 mb-4'>
            <div className='flex-1 min-w-0 space-y-2'>
              <Skeleton width="70%" height="1.5rem" />
              <Skeleton width="100px" height="0.75rem" />
            </div>
          </div>
          <div className='mb-4 rounded-2xl border border-sky-500/30 bg-slate-900/50 p-4'>
            <SkeletonText lines={3} />
          </div>
          <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
            <Skeleton width="100px" height="0.75rem" />
            <Skeleton width="100px" height="0.75rem" />
            <Skeleton width="100px" height="0.75rem" />
          </div>
          <div className='mt-4 pt-4 border-t border-white/5'>
            <Skeleton width="100%" height="2.5rem" rounded="lg" />
          </div>
        </section>

        {/* 댓글 섹션 스켈레톤 */}
        <section className={`${cardStyles.section} p-4`}>
          <div className='flex items-center gap-2 mb-4'>
            <Skeleton width="1rem" height="1rem" />
            <Skeleton width="1.5rem" height="0.875rem" />
          </div>
          <div className='mb-4 flex gap-2 items-stretch'>
            <Skeleton width="100%" height="4rem" rounded="xl" className="flex-1" />
            <Skeleton width="3rem" height="4rem" rounded="xl" />
          </div>
          <div className='space-y-4'>
            {[1, 2].map((i) => (
              <div key={i} className='rounded-2xl border border-white/10 bg-slate-950/30 p-4'>
                <div className='flex items-center gap-2 mb-2'>
                  <Skeleton width="80px" height="0.875rem" />
                  <Skeleton width="60px" height="0.75rem" />
                </div>
                <SkeletonText lines={2} />
              </div>
            ))}
          </div>
        </section>
      </TeamsPageLayout>
    );
  }

  if (error && !taskDetail) {
    return (
      <TeamsPageLayout>
        <div className={`${cardStyles.errorSection} p-4 text-center`}>
          <p className='text-base font-semibold text-red-400'>{error}</p>
          <ButtonLink href={`/teams/${teamId}`} variant='secondary' size='lg' className='mt-4'>
            팀 보드로 돌아가기
          </ButtonLink>
        </div>
      </TeamsPageLayout>
    );
  }

  if (!taskDetail) return null;

  const currentUserId = session?.user?.userId ?? null;

  return (
    <TeamsPageLayout>
      {/* 헤더 */}
      <div className='flex items-center justify-between'>
        <ButtonLink href={`/teams/${teamId}`} variant='secondary' size='lg'>
          ← 팀 보드로 돌아가기
        </ButtonLink>
      </div>

      {/* 태스크 상세 정보 */}
      <section className={`${cardStyles.section} p-4`}>
        {isEditing ? (
          <>
            <div className='mb-4'>
              <SectionLabel spacing='tight'>태스크 수정</SectionLabel>
              <h2 className='mt-2 text-xl font-bold text-white'>{taskDetail.taskName}</h2>
            </div>
            <TaskForm
              mode='edit'
              initialData={{
                taskName: taskDetail.taskName,
                taskDescription: taskDetail.taskDescription || '',
                startAt: taskDetail.startAt ? new Date(taskDetail.startAt).toISOString().split('T')[0] : '',
                endAt: taskDetail.endAt ? new Date(taskDetail.endAt).toISOString().split('T')[0] : '',
              }}
              onSubmit={handleUpdateTask}
              onCancel={handleCancelEdit}
              isSubmitting={isUpdatingTask}
            />
          </>
        ) : (
          <>
            {/* 헤더: 제목 + 작성자 + 수정 아이콘 */}
            <div className='flex items-start justify-between gap-3 mb-4'>
              <div className='flex-1 min-w-0'>
                <h1 className='text-xl font-bold text-white break-words'>{taskDetail.taskName}</h1>
                <span className='mt-1 block text-xs text-slate-500'>
                  {taskDetail.userName || `사용자 ${taskDetail.crtdBy}`}
                </span>
              </div>
              {currentUserId === taskDetail.crtdBy && (
                <button
                  onClick={handleStartEdit}
                  disabled={isUpdatingTask}
                  className='p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition disabled:opacity-50'
                  title='수정'
                >
                  <EditIcon className='w-5 h-5' />
                </button>
              )}
            </div>

            {/* 본문 */}
            {taskDetail.taskDescription && (
              <div className='mb-4 rounded-2xl border border-sky-500/30 bg-slate-900/50 p-4 shadow-lg shadow-sky-500/10'>
                <p className='whitespace-pre-wrap text-base leading-relaxed text-slate-200'>
                  {taskDetail.taskDescription}
                </p>
              </div>
            )}

            {/* 날짜 정보 (인라인 아이콘) - 순서: 생성일 → 시작일 → 종료일 */}
            <DateInfoInline
              crtdAt={taskDetail.crtdAt}
              startAt={taskDetail.startAt}
              endAt={taskDetail.endAt}
              size="md"
            />

            {/* 상태 드롭다운 (하단 배치, 카드 스타일) */}
            <div className='mt-4 pt-4 border-t border-white/5'>
              <StatusDropdown
                currentStatus={taskDetail.taskStatus as TaskStatusKey}
                onStatusChange={handleStatusChange}
                disabled={isStatusUpdating}
              />
              {isStatusUpdating && (
                <div className='mt-2 text-center'>
                  <span className='text-xs text-sky-400 animate-pulse'>상태 변경 중...</span>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* 에러 메시지 */}
      {error && <ErrorAlert message={error} className='text-center animate-in fade-in duration-300' />}

      {/* 성공 메시지 */}
      {successMessage && (
        <SuccessAlert message={successMessage} className='text-center animate-in fade-in duration-300' />
      )}

      {/* 댓글 섹션 */}
      <section className={`${cardStyles.section} p-4`}>
        {/* 댓글 헤딩 (아이콘 + 수) */}
        <div className='flex items-center gap-2 mb-4 text-slate-400'>
          <CommentIcon />
          <span className='text-sm'>{comments.length}</span>
        </div>

        {/* 댓글 작성 폼 (컴팩트) */}
        <div className='mb-4 flex gap-2 items-stretch'>
          <textarea
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder='댓글을 입력하세요...'
            className='flex-1 resize-none rounded-xl border border-white/10 bg-slate-900/60 p-3 text-sm text-white placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20'
            rows={2}
          />
          <button
            onClick={handleCreateComment}
            disabled={!newComment.trim() || isCreatingComment}
            className='flex items-center justify-center px-4 rounded-xl bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed'
            title='댓글 작성'
          >
            <SendIcon className='w-5 h-5' />
          </button>
        </div>

        {/* 댓글 목록 */}
        <div className='space-y-4'>
          {comments.length === 0 ? (
            <div className='rounded-2xl border border-dashed border-slate-600/80 px-4 py-10 text-center text-sm text-slate-500'>
              아직 댓글이 없습니다. 첫 댓글을 작성해보세요!
            </div>
          ) : (
            comments.map((comment, index) => (
              <div
                key={comment.commentId ?? `comment-${index}`}
                className='rounded-2xl border border-white/10 bg-slate-950/30 p-4'
              >
                {editingCommentId === comment.commentId ? (
                  <div>
                    <textarea
                      value={editingContent}
                      onChange={e => setEditingContent(e.target.value)}
                      className='w-full resize-none rounded-xl border border-white/10 bg-slate-900/60 p-3 text-sm text-white placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20'
                      rows={3}
                    />
                    <div className='mt-4 flex justify-end gap-2'>
                      <Button
                        variant='secondary'
                        size='lg'
                        onClick={handleCancelEditComment}
                        disabled={isUpdatingComment}
                      >
                        취소
                      </Button>
                      <Button
                        size='lg'
                        onClick={() => handleUpdateComment(comment.commentId)}
                        disabled={!editingContent.trim() || isUpdatingComment}
                      >
                        {isUpdatingComment ? '수정 중...' : '수정'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {/* 댓글 헤더: 닉네임 · 시간 (수정됨) + 아이콘 버튼 - 한 줄 */}
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-2'>
                        <span className='font-semibold text-sm text-white'>
                          {comment.userName || `사용자 ${comment.userId}`}
                        </span>
                        <span className='text-xs text-slate-500'>·</span>
                        <span className='text-xs text-slate-500'>
                          {formatCompactDateTime(comment.crtdAt)}
                        </span>
                        {comment.mdfdAt && <span className='text-xs text-slate-500'>(수정됨)</span>}
                      </div>
                      {currentUserId === comment.userId && comment.status !== 0 && (
                        <div className='flex items-center gap-1'>
                          <button
                            onClick={() => handleStartEditComment(comment)}
                            disabled={isUpdatingComment || isDeletingComment}
                            className='p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition disabled:opacity-50'
                            title='수정'
                          >
                            <EditIcon />
                          </button>
                          <button
                            onClick={() => handleDeleteComment(comment.commentId)}
                            disabled={isDeletingComment}
                            className='p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-50'
                            title='삭제'
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      )}
                    </div>
                    {/* 댓글 내용 */}
                    {comment.status === 0 ? (
                      <p className='mt-2 text-sm italic text-slate-500'>삭제된 댓글입니다.</p>
                    ) : (
                      <p className='mt-2 text-sm leading-relaxed text-slate-300 whitespace-pre-wrap'>
                        {comment.commentContent}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </TeamsPageLayout>
  );
}
