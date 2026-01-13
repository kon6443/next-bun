"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  getTaskDetail,
  createTaskComment,
  updateTaskComment,
  deleteTaskComment,
  updateTask,
  type TaskDetailResponse,
} from "@/services/teamService";
import type { TaskComment } from "@/app/types/task";

type TaskDetailPageProps = {
  teamId: string;
  taskId: string;
};

const taskStatusLabels: Record<number, string> = {
  1: "Ideation",
  2: "In Progress",
  3: "Completed",
  4: "On Hold",
  5: "Cancelled",
};

const taskStatusColors: Record<number, string> = {
  1: "linear-gradient(135deg, #facc15, #f97316)",
  2: "linear-gradient(135deg, #38bdf8, #6366f1)",
  3: "linear-gradient(135deg, #34d399, #10b981)",
  4: "linear-gradient(135deg, #fbbf24, #f59e0b)",
  5: "linear-gradient(135deg, #ef4444, #dc2626)",
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
  const [newComment, setNewComment] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTaskName, setEditTaskName] = useState("");
  const [editTaskDescription, setEditTaskDescription] = useState("");
  const [editStartAt, setEditStartAt] = useState("");
  const [editEndAt, setEditEndAt] = useState("");

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

  // taskDetail이 변경될 때 편집 필드 초기화 (수정 모드가 아닐 때만)
  useEffect(() => {
    if (taskDetail && !isEditing) {
      setEditTaskName(taskDetail.taskName);
      setEditTaskDescription(taskDetail.taskDescription || "");
      setEditStartAt(
        taskDetail.startAt
          ? new Date(taskDetail.startAt).toISOString().split("T")[0]
          : ""
      );
      setEditEndAt(
        taskDetail.endAt
          ? new Date(taskDetail.endAt).toISOString().split("T")[0]
          : ""
      );
    }
  }, [taskDetail, isEditing]);

  // 수정 모드 시작
  const handleStartEdit = () => {
    if (!taskDetail) return;
    setEditTaskName(taskDetail.taskName);
    setEditTaskDescription(taskDetail.taskDescription || "");
    setEditStartAt(
      taskDetail.startAt
        ? new Date(taskDetail.startAt).toISOString().split("T")[0]
        : ""
    );
    setEditEndAt(
      taskDetail.endAt
        ? new Date(taskDetail.endAt).toISOString().split("T")[0]
        : ""
    );
    setIsEditing(true);
    setError(null);
  };

  // 수정 모드 취소
  const handleCancelEdit = () => {
    setIsEditing(false);
    setError(null);
    if (taskDetail) {
      setEditTaskName(taskDetail.taskName);
      setEditTaskDescription(taskDetail.taskDescription || "");
      setEditStartAt(
        taskDetail.startAt
          ? new Date(taskDetail.startAt).toISOString().split("T")[0]
          : ""
      );
      setEditEndAt(
        taskDetail.endAt
          ? new Date(taskDetail.endAt).toISOString().split("T")[0]
          : ""
      );
    }
  };

  // 태스크 수정
  const handleUpdateTask = async () => {
    if (!taskDetail || !session?.user?.accessToken) return;

    if (!editTaskName.trim() || !editTaskDescription.trim()) {
      setError("태스크 이름과 설명을 모두 입력해주세요.");
      return;
    }

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
          taskName: editTaskName.trim(),
          taskDescription: editTaskDescription.trim(),
          startAt: editStartAt || null,
          endAt: editEndAt || null,
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
      // 태스크 상세를 재조회하여 최신 댓글 목록(올바른 userName 포함)을 받아옴
      await fetchTaskDetail(false);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "댓글 작성에 실패했습니다.";
      setError(errorMessage);
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
      <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 top-0 h-72 w-72 rounded-full bg-indigo-600/30 blur-[130px]" />
          <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-sky-500/20 blur-[150px]" />
        </div>
        <main className="relative z-10 mx-auto flex max-w-4xl flex-col gap-10 px-4 pb-24 pt-16 sm:px-8">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl text-center text-slate-400">
            태스크 정보를 불러오는 중...
          </div>
        </main>
      </div>
    );
  }

  if (error && !taskDetail) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 top-0 h-72 w-72 rounded-full bg-indigo-600/30 blur-[130px]" />
          <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-sky-500/20 blur-[150px]" />
        </div>
        <main className="relative z-10 mx-auto flex max-w-4xl flex-col gap-10 px-4 pb-24 pt-16 sm:px-8">
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-8 backdrop-blur-xl text-center">
            <p className="text-base font-semibold text-red-400">{error}</p>
            <Link
              href={`/teams/${teamId}`}
              className="mt-4 inline-block rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/40"
            >
              팀 보드로 돌아가기
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!taskDetail) return null;

  const currentUserId = session?.user?.userId ?? null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-0 h-72 w-72 rounded-full bg-indigo-600/30 blur-[130px]" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-sky-500/20 blur-[150px]" />
      </div>

      <main className="relative z-10 mx-auto flex max-w-4xl flex-col gap-10 px-4 pb-24 pt-16 sm:px-8">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <Link
            href={`/teams/${teamId}`}
            className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/40"
          >
            ← 팀 보드로 돌아가기
          </Link>
        </div>

        {/* 태스크 상세 정보 */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span
                className="h-12 w-12 rounded-2xl border border-white/20 shadow-inner"
                style={{
                  background: taskStatusColors[taskDetail.taskStatus] || taskStatusColors[1],
                }}
                aria-hidden="true"
              />
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
                  {taskStatusLabels[taskDetail.taskStatus] || "Unknown"}
                </p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editTaskName}
                    onChange={(e) => setEditTaskName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2 text-2xl font-bold text-white focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20 md:text-3xl"
                    placeholder="태스크 이름"
                    disabled={isSubmitting}
                  />
                ) : (
                  <h1 className="mt-1 text-3xl font-bold text-white md:text-4xl">
                    {taskDetail.taskName}
                  </h1>
                )}
              </div>
            </div>
            {!isEditing && currentUserId === taskDetail.crtdBy && (
              <button
                onClick={handleStartEdit}
                disabled={isSubmitting}
                className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/40 disabled:opacity-50"
              >
                수정
              </button>
            )}
          </div>

          {isEditing ? (
            <div className="mb-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  태스크 설명 <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={editTaskDescription}
                  onChange={(e) => setEditTaskDescription(e.target.value)}
                  placeholder="태스크에 대한 상세 설명을 입력하세요"
                  rows={6}
                  className="w-full resize-none rounded-xl border border-white/10 bg-slate-900/60 p-4 text-white placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  disabled={isSubmitting}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-300">
                    시작일
                  </label>
                  <input
                    type="date"
                    value={editStartAt}
                    onChange={(e) => setEditStartAt(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-white focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-300">
                    종료일
                  </label>
                  <input
                    type="date"
                    value={editEndAt}
                    onChange={(e) => setEditEndAt(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-white focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleCancelEdit}
                  disabled={isSubmitting}
                  className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/40 disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  onClick={handleUpdateTask}
                  disabled={isSubmitting || !editTaskName.trim() || !editTaskDescription.trim()}
                  className="rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "수정 중..." : "수정 완료"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {taskDetail.taskDescription && (
                <div className="mb-6 rounded-2xl border border-white/10 bg-slate-950/30 p-6">
                  <p className="text-sm leading-relaxed text-slate-300">
                    {taskDetail.taskDescription}
                  </p>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                {taskDetail.startAt && (
                  <div key="startAt" className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                    <p className="text-xs uppercase tracking-[0.5em] text-slate-500">
                      시작일
                    </p>
                    <p className="mt-2 text-base text-white">
                      {formatDate(taskDetail.startAt)}
                    </p>
                  </div>
                )}
                {taskDetail.endAt && (
                  <div key="endAt" className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                    <p className="text-xs uppercase tracking-[0.5em] text-slate-500">
                      종료일
                    </p>
                    <p className="mt-2 text-base text-white">
                      {formatDate(taskDetail.endAt)}
                    </p>
                  </div>
                )}
                <div key="crtdAt" className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                  <p className="text-xs uppercase tracking-[0.5em] text-slate-500">
                    생성일
                  </p>
                  <p className="mt-2 text-base text-white">
                    {formatDate(taskDetail.crtdAt)}
                  </p>
                </div>
              </div>
            </>
          )}
        </section>

        {/* 에러 메시지 */}
        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-center">
            <p className="text-base font-semibold text-red-400">{error}</p>
          </div>
        )}

        {/* 댓글 섹션 */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
          <h2 className="mb-6 text-2xl font-bold text-white">댓글</h2>

          {/* 댓글 작성 폼 */}
          <div className="mb-8 rounded-2xl border border-white/10 bg-slate-950/30 p-6">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="댓글을 입력하세요..."
              className="w-full resize-none rounded-xl border border-white/10 bg-slate-900/60 p-4 text-white placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              rows={4}
            />
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleCreateComment}
                disabled={!newComment.trim() || isSubmitting}
                className="rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "작성 중..." : "댓글 작성"}
              </button>
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
                  className="rounded-2xl border border-white/10 bg-slate-950/30 p-6"
                >
                  {editingCommentId === comment.commentId ? (
                    <div>
                      <textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        className="w-full resize-none rounded-xl border border-white/10 bg-slate-900/60 p-4 text-white placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                        rows={3}
                      />
                      <div className="mt-4 flex justify-end gap-2">
                        <button
                          onClick={handleCancelEditComment}
                          disabled={isSubmitting}
                          className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/40 disabled:opacity-50"
                        >
                          취소
                        </button>
                        <button
                          onClick={() => handleUpdateComment(comment.commentId)}
                          disabled={!editingContent.trim() || isSubmitting}
                          className="rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSubmitting ? "수정 중..." : "수정"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <p className="font-semibold text-white">
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
                            <p className="mt-3 text-sm leading-relaxed text-slate-300">
                              {comment.commentContent}
                            </p>
                          )}
                        </div>
                        {currentUserId === comment.userId && comment.status !== 0 && (
                          <div className="ml-4 flex gap-2">
                        <button
                          onClick={() => handleStartEditComment(comment)}
                          disabled={isSubmitting}
                          className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-white/40 disabled:opacity-50"
                        >
                          수정
                        </button>
                            <button
                              onClick={() => handleDeleteComment(comment.commentId)}
                              disabled={isSubmitting}
                              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
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
      </main>
    </div>
  );
}
