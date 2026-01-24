"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  getTaskDetail,
  createTaskComment,
  updateTaskComment,
  deleteTaskComment,
  updateTask,
  type TaskDetailResponse,
} from "@/services/teamService";
import type { TaskComment } from "@/app/types/task";
import {
  TeamsPageLayout,
  Button,
  ButtonLink,
  SectionLabel,
  TaskForm,
  TaskStatusBadge,
  ErrorAlert,
  type TaskFormData,
} from "../../../components";
import { cardStyles } from "@/styles/teams";

type TaskDetailPageProps = {
  teamId: string;
  taskId: string;
};

export default function TaskDetailPage({
  teamId,
  taskId,
}: TaskDetailPageProps) {
  const { data: session } = useSession();
  const [taskDetail, setTaskDetail] = useState<TaskDetailResponse | null>(
    null,
  );
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const fetchTaskDetail = useCallback(async (showLoading = true) => {
    if (!session?.user?.accessToken) {
      setError("인증이 필요합니다. 다시 로그인해주세요.");
      if (showLoading) setIsLoading(false);
      return;
    }

    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const teamIdNum = parseInt(teamId, 10);
      const taskIdNum = parseInt(taskId, 10);
      if (isNaN(teamIdNum) || isNaN(taskIdNum)) {
        throw new Error("유효하지 않은 팀 ID 또는 태스크 ID입니다.");
      }

      const response = await getTaskDetail(
        teamIdNum,
        taskIdNum,
        session.user.accessToken,
      );

      // 날짜 변환
      const taskData = {
        ...response.data,
        startAt: response.data.startAt
          ? new Date(response.data.startAt)
          : null,
        endAt: response.data.endAt ? new Date(response.data.endAt) : null,
        crtdAt: new Date(response.data.crtdAt),
        comments: response.data.comments.map((comment) => ({
          ...comment,
          crtdAt: new Date(comment.crtdAt),
          mdfdAt: comment.mdfdAt ? new Date(comment.mdfdAt) : null,
        })),
      };

      setTaskDetail(taskData);
      setComments(taskData.comments);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "태스크 상세 정보를 불러오는데 실패했습니다.";
      setError(errorMessage);
      console.error("Failed to fetch task detail:", err);
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, [teamId, taskId, session?.user?.accessToken]);

  useEffect(() => {
    fetchTaskDetail();
  }, [fetchTaskDetail]);


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
    if (!taskDetail || !session?.user?.accessToken) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const teamIdNum = parseInt(teamId, 10);
      const taskIdNum = parseInt(taskId, 10);
      if (isNaN(teamIdNum) || isNaN(taskIdNum)) {
        throw new Error("유효하지 않은 팀 ID 또는 태스크 ID입니다.");
      }

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
      // 태스크 상세 정보 재조회
      await fetchTaskDetail(false);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "태스크 수정에 실패했습니다.";
      setError(errorMessage);
      console.error("Failed to update task:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateComment = async () => {
    if (!newComment.trim() || !session?.user?.accessToken) return;

    setIsSubmitting(true);
    try {
      const teamIdNum = parseInt(teamId, 10);
      const taskIdNum = parseInt(taskId, 10);
      await createTaskComment(
        teamIdNum,
        taskIdNum,
        { commentContent: newComment.trim() },
        session.user.accessToken,
      );

      setNewComment("");
      setError(null);
      setSuccessMessage("댓글이 작성되었습니다.");
      // 태스크 상세를 재조회하여 최신 댓글 목록(올바른 userName 포함)을 받아옴
      await fetchTaskDetail(false);
      
      // 3초 후 성공 메시지 자동 제거
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "댓글 작성에 실패했습니다.";
      setError(errorMessage);
      setSuccessMessage(null);
      console.error("Failed to create comment:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEditComment = (comment: TaskComment) => {
    setEditingCommentId(comment.commentId);
    setEditingContent(comment.commentContent);
  };

  const handleCancelEditComment = () => {
    setEditingCommentId(null);
    setEditingContent("");
  };

  const handleUpdateComment = async (commentId: number) => {
    if (!editingContent.trim() || !session?.user?.accessToken) return;

    setIsSubmitting(true);
    try {
      const teamIdNum = parseInt(teamId, 10);
      const taskIdNum = parseInt(taskId, 10);
      await updateTaskComment(
        teamIdNum,
        taskIdNum,
        commentId,
        { commentContent: editingContent.trim() },
        session.user.accessToken,
      );

      setEditingCommentId(null);
      setEditingContent("");
      // 태스크 상세를 재조회하여 최신 댓글 목록(올바른 userName 포함)을 받아옴
      await fetchTaskDetail(false);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "댓글 수정에 실패했습니다.";
      setError(errorMessage);
      console.error("Failed to update comment:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!session?.user?.accessToken) return;
    if (!confirm("댓글을 삭제하시겠습니까?")) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const teamIdNum = parseInt(teamId, 10);
      const taskIdNum = parseInt(taskId, 10);
      
      if (isNaN(teamIdNum) || isNaN(taskIdNum)) {
        throw new Error("유효하지 않은 팀 ID 또는 태스크 ID입니다.");
      }

      // 댓글 삭제 시도
      await deleteTaskComment(
        teamIdNum,
        taskIdNum,
        commentId,
        session.user.accessToken,
      );

      // 삭제 성공 후 태스크 상세를 재조회하여 최신 댓글 목록을 받아옴
      // 목록 갱신 실패는 별도로 처리하여 삭제 성공 여부와 분리
      try {
        await fetchTaskDetail(false);
      } catch (refreshErr) {
        // 목록 갱신 실패는 경고만 표시 (삭제는 이미 성공)
        console.warn("Failed to refresh task detail after delete:", refreshErr);
        setError("댓글이 삭제되었지만 목록을 새로고침하지 못했습니다. 페이지를 새로고침해주세요.");
      }
    } catch (err) {
      // 실제 삭제 실패 시 에러 처리
      const errorMessage =
        err instanceof Error ? err.message : "댓글 삭제에 실패했습니다.";
      setError(errorMessage);
      
      // 에러 로깅 개선
      if (err instanceof Error) {
        console.error("Failed to delete comment:", {
          message: err.message,
          stack: err.stack,
          name: err.name,
          commentId,
          teamId,
          taskId,
        });
      } else {
        console.error("Failed to delete comment (unknown error type):", {
          error: err,
          errorType: typeof err,
          errorString: String(err),
          commentId,
          teamId,
          taskId,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 컴팩트 날짜+시간 포맷 (M/D HH:mm)
  const formatCompactDateTime = (date: Date) => {
    const d = new Date(date);
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${hours}:${minutes}`;
  };

  if (isLoading) {
    return (
      <TeamsPageLayout>
        <div
          className={`${cardStyles.section} p-4 text-center text-slate-400`}
        >
          태스크 정보를 불러오는 중...
        </div>
      </TeamsPageLayout>
    );
  }

  if (error && !taskDetail) {
    return (
      <TeamsPageLayout>
        <div className={`${cardStyles.errorSection} p-4 text-center`}>
          <p className="text-base font-semibold text-red-400">{error}</p>
          <ButtonLink
            href={`/teams/${teamId}`}
            variant="secondary"
            size="lg"
            className="mt-4"
          >
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
      <div className="flex items-center justify-between">
        <ButtonLink href={`/teams/${teamId}`} variant="secondary" size="lg">
          ← 팀 보드로 돌아가기
        </ButtonLink>
      </div>

      {/* 태스크 상세 정보 */}
      <section className={`${cardStyles.section} p-4`}>
          {isEditing ? (
            <>
              <div className="mb-4">
                <SectionLabel spacing="tight">태스크 수정</SectionLabel>
                <h2 className="mt-2 text-xl font-bold text-white">
                  {taskDetail.taskName}
                </h2>
              </div>
              <TaskForm
                mode="edit"
                initialData={{
                  taskName: taskDetail.taskName,
                  taskDescription: taskDetail.taskDescription || "",
                  startAt: taskDetail.startAt
                    ? new Date(taskDetail.startAt).toISOString().split("T")[0]
                    : "",
                  endAt: taskDetail.endAt
                    ? new Date(taskDetail.endAt).toISOString().split("T")[0]
                    : "",
                }}
                onSubmit={handleUpdateTask}
                onCancel={handleCancelEdit}
                isSubmitting={isSubmitting}
              />
            </>
          ) : (
            <>
              {/* 컴팩트 헤더: 상태뱃지 + 작성자 / 제목 / 수정 아이콘 */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <TaskStatusBadge status={taskDetail.taskStatus} />
                    <span className="text-xs text-slate-500">
                      {taskDetail.userName || `사용자 ${taskDetail.crtdBy}`}
                    </span>
                  </div>
                  <h1 className="text-xl font-bold text-white break-words">
                    {taskDetail.taskName}
                  </h1>
                </div>
                {currentUserId === taskDetail.crtdBy && (
                  <button
                    onClick={handleStartEdit}
                    disabled={isSubmitting}
                    className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition disabled:opacity-50"
                    title="수정"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
              </div>

              {/* 본문 */}
              {taskDetail.taskDescription && (
                <div className="mb-4 rounded-2xl border border-sky-500/30 bg-slate-900/50 p-4 shadow-lg shadow-sky-500/10">
                  <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-200">
                    {taskDetail.taskDescription}
                  </p>
                </div>
              )}

              {/* 날짜 정보 (인라인 아이콘) - 순서: 생성일 → 시작일 → 종료일 */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
                {/* 생성일 */}
                <span className="flex items-center gap-1.5" title="생성일">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{formatCompactDateTime(taskDetail.crtdAt)}</span>
                </span>
                {/* 구분자 (시작일 또는 종료일이 있을 때) */}
                {(taskDetail.startAt || taskDetail.endAt) && (
                  <span className="text-slate-600">·</span>
                )}
                {/* 시작일 */}
                {taskDetail.startAt && (
                  <span className="flex items-center gap-1.5" title="시작일">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{formatCompactDateTime(taskDetail.startAt)}</span>
                  </span>
                )}
                {/* 화살표 (시작일과 종료일 모두 있을 때) */}
                {taskDetail.startAt && taskDetail.endAt && (
                  <span className="text-slate-600">→</span>
                )}
                {/* 종료일 */}
                {taskDetail.endAt && (
                  <span className="flex items-center gap-1.5" title="종료일">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{formatCompactDateTime(taskDetail.endAt)}</span>
                  </span>
                )}
              </div>
            </>
          )}
        </section>

        {/* 에러 메시지 */}
        {error && (
          <ErrorAlert message={error} className="text-center animate-in fade-in duration-300" />
        )}

        {/* 성공 메시지 */}
        {successMessage && (
          <div className="rounded-2xl border border-green-500/20 bg-green-500/10 px-6 py-4 text-center animate-in fade-in duration-300">
            <p className="text-base font-semibold text-green-400">{successMessage}</p>
          </div>
        )}

        {/* 댓글 섹션 */}
        <section className={`${cardStyles.section} p-4`}>
          {/* 댓글 헤딩 (아이콘 + 수) */}
          <div className="flex items-center gap-2 mb-4 text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-sm">{comments.length}</span>
          </div>

          {/* 댓글 작성 폼 (컴팩트) */}
          <div className="mb-4 flex gap-2 items-end">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="댓글을 입력하세요..."
              className="flex-1 resize-none rounded-xl border border-white/10 bg-slate-900/60 p-3 text-sm text-white placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              rows={2}
            />
            <button
              onClick={handleCreateComment}
              disabled={!newComment.trim() || isSubmitting}
              className="p-3 rounded-xl bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
              title="댓글 작성"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>

          {/* 댓글 목록 */}
          <div className="space-y-4">
            {comments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-600/80 px-4 py-10 text-center text-sm text-slate-500">
                아직 댓글이 없습니다. 첫 댓글을 작성해보세요!
              </div>
            ) : (
              comments.map((comment, index) => (
                <div
                  key={comment.commentId ?? `comment-${index}`}
                  className="rounded-2xl border border-white/10 bg-slate-950/30 p-4"
                >
                  {editingCommentId === comment.commentId ? (
                    <div>
                      <textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        className="w-full resize-none rounded-xl border border-white/10 bg-slate-900/60 p-3 text-sm text-white placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                        rows={3}
                      />
                      <div className="mt-4 flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="lg"
                          onClick={handleCancelEditComment}
                          disabled={isSubmitting}
                        >
                          취소
                        </Button>
                        <Button
                          size="lg"
                          onClick={() => handleUpdateComment(comment.commentId)}
                          disabled={!editingContent.trim() || isSubmitting}
                        >
                          {isSubmitting ? "수정 중..." : "수정"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* 댓글 헤더: 닉네임 · 시간 (수정됨) + 아이콘 버튼 - 한 줄 */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-white">
                            {comment.userName || `사용자 ${comment.userId}`}
                          </span>
                          <span className="text-xs text-slate-500">·</span>
                          <span className="text-xs text-slate-500">
                            {formatCompactDateTime(comment.crtdAt)}
                          </span>
                          {comment.mdfdAt && (
                            <span className="text-xs text-slate-500">(수정됨)</span>
                          )}
                        </div>
                        {currentUserId === comment.userId && comment.status !== 0 && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleStartEditComment(comment)}
                              disabled={isSubmitting}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition disabled:opacity-50"
                              title="수정"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteComment(comment.commentId)}
                              disabled={isSubmitting}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-50"
                              title="삭제"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                      {/* 댓글 내용 */}
                      {comment.status === 0 ? (
                        <p className="mt-2 text-sm italic text-slate-500">
                          삭제된 댓글입니다.
                        </p>
                      ) : (
                        <p className="mt-2 text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">
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
