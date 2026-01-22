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
  DateInfoCard,
  TaskForm,
  TaskStatusBadge,
  taskStatusLabels,
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
          startAt: data.startAt || null,
          endAt: data.endAt || null,
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

  const formatDate = (date: Date | null) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "방금 전";
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 7) return `${days}일 전`;
    return formatDate(date);
  };

  if (isLoading) {
    return (
      <TeamsPageLayout maxWidth="4xl">
        <div
          className={`${cardStyles.section} p-4 sm:p-8 text-center text-slate-400`}
        >
          태스크 정보를 불러오는 중...
        </div>
      </TeamsPageLayout>
    );
  }

  if (error && !taskDetail) {
    return (
      <TeamsPageLayout maxWidth="4xl">
        <div className={`${cardStyles.errorSection} p-4 sm:p-8 text-center`}>
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
    <TeamsPageLayout maxWidth="4xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <ButtonLink href={`/teams/${teamId}`} variant="secondary" size="lg">
          ← 팀 보드로 돌아가기
        </ButtonLink>
      </div>

      {/* 태스크 상세 정보 */}
      <section className={`${cardStyles.section} p-4 sm:p-6 md:p-8`}>
          {isEditing ? (
            <>
              <div className="mb-4 sm:mb-6">
                <SectionLabel spacing="tight">태스크 수정</SectionLabel>
                <h2 className="mt-2 text-xl sm:text-2xl font-bold text-white">
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
              <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3 sm:gap-4">
                  <TaskStatusBadge status={taskDetail.taskStatus} />
                  <div className="flex-1 min-w-0">
                    <SectionLabel spacing="tight">
                      {taskStatusLabels[taskDetail.taskStatus] || "Unknown"}
                    </SectionLabel>
                    <h1 className="mt-1 text-2xl sm:text-3xl md:text-4xl font-bold text-white break-words">
                      {taskDetail.taskName}
                    </h1>
                    <p className="mt-2 text-sm text-slate-400">
                      작성자: {taskDetail.userName || `사용자 ${taskDetail.crtdBy}`}
                    </p>
                  </div>
                </div>
                {currentUserId === taskDetail.crtdBy && (
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={handleStartEdit}
                    disabled={isSubmitting}
                    className="w-full sm:w-auto"
                  >
                    수정
                  </Button>
                )}
              </div>

              {taskDetail.taskDescription && (
                <div className="mb-6 rounded-2xl border border-sky-500/30 bg-slate-900/50 p-6 sm:p-8 shadow-lg shadow-sky-500/10">
                  <p className="whitespace-pre-wrap text-lg sm:text-xl leading-relaxed text-slate-200">
                    {taskDetail.taskDescription}
                  </p>
                </div>
              )}

              <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                <DateInfoCard
                  label="시작일"
                  date={taskDetail.startAt}
                  variant="default"
                />
                <DateInfoCard
                  label="종료일"
                  date={taskDetail.endAt}
                  variant="default"
                />
                <DateInfoCard
                  label="생성일"
                  date={taskDetail.crtdAt}
                  variant="muted"
                />
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
        <section className={`${cardStyles.section} p-4 sm:p-6 md:p-8`}>
          <h2 className="mb-4 sm:mb-6 text-xl sm:text-2xl font-bold text-white">댓글</h2>

          {/* 댓글 작성 폼 */}
          <div className="mb-6 sm:mb-8 rounded-2xl border border-white/10 bg-slate-950/30 p-4 sm:p-6">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="댓글을 입력하세요..."
              className="w-full resize-none rounded-xl border border-white/10 bg-slate-900/60 p-3 sm:p-4 text-sm sm:text-base text-white placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              rows={4}
            />
            <div className="mt-4 flex justify-end">
              <Button
                size="lg"
                onClick={handleCreateComment}
                disabled={!newComment.trim() || isSubmitting}
              >
                {isSubmitting ? "작성 중..." : "댓글 작성"}
              </Button>
            </div>
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
                  className="rounded-2xl border border-white/10 bg-slate-950/30 p-4 sm:p-6"
                >
                  {editingCommentId === comment.commentId ? (
                    <div>
                      <textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        className="w-full resize-none rounded-xl border border-white/10 bg-slate-900/60 p-3 sm:p-4 text-sm sm:text-base text-white placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
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
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <p className="font-semibold text-white text-sm sm:text-base">
                              {comment.userName || `사용자 ${comment.userId}`}
                            </p>
                            <span className="text-xs text-slate-500">
                              {formatRelativeTime(comment.crtdAt)}
                              {comment.mdfdAt && " (수정됨)"}
                            </span>
                          </div>
                          {comment.status === 0 ? (
                            <p className="mt-3 text-sm italic text-slate-500">
                              삭제된 댓글입니다.
                            </p>
                          ) : (
                            <p className="mt-3 text-sm sm:text-base leading-relaxed text-slate-300 whitespace-pre-wrap">
                              {comment.commentContent}
                            </p>
                          )}
                        </div>
                        {currentUserId === comment.userId && comment.status !== 0 && (
                          <div className="flex gap-2 sm:ml-4">
                        <button
                          onClick={() => handleStartEditComment(comment)}
                          disabled={isSubmitting}
                          className="rounded-lg border border-white/20 px-3 py-2 sm:py-1.5 text-xs font-semibold text-slate-300 transition hover:border-white/40 disabled:opacity-50"
                        >
                          수정
                        </button>
                            <button
                              onClick={() => handleDeleteComment(comment.commentId)}
                              disabled={isSubmitting}
                              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 sm:py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
                            >
                              삭제
                            </button>
                          </div>
                        )}
                      </div>
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
