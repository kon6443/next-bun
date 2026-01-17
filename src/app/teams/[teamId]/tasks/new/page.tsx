"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { createTask } from "@/services/teamService";
import { TeamsPageLayout, Button, ButtonLink } from "../../../components";
import { cardStyles } from "@/styles/teams";

type CreateTaskPageProps = {
  params: Promise<{ teamId: string }>;
};

export default function CreateTaskPage({ params }: CreateTaskPageProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [teamId, setTeamId] = useState<string>("");
  const [taskName, setTaskName] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setTeamId(p.teamId));
  }, [params]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!taskName.trim() || !taskDescription.trim()) {
      setError("태스크 이름과 설명을 모두 입력해주세요.");
      return;
    }

    if (!session?.user?.accessToken) {
      setError("인증이 필요합니다. 다시 로그인해주세요.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const teamIdNum = parseInt(teamId, 10);
      if (isNaN(teamIdNum)) {
        throw new Error("유효하지 않은 팀 ID입니다.");
      }

      await createTask(
        teamIdNum,
        {
          taskName: taskName.trim(),
          taskDescription: taskDescription.trim(),
          startAt: startAt || null,
          endAt: endAt || null,
        },
        session.user.accessToken
      );

      router.push(`/teams/${teamId}`);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "태스크 생성에 실패했습니다.";
      setError(errorMessage);
      console.error("Failed to create task:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <TeamsPageLayout maxWidth="4xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <ButtonLink href={`/teams/${teamId || ""}`} variant="secondary">
          ← 팀 보드로 돌아가기
        </ButtonLink>
      </div>

      {/* 태스크 생성 폼 */}
      <section className={`${cardStyles.section} p-8`}>
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.6em] text-slate-400">
            New Task
          </p>
          <h1 className="mt-4 text-4xl font-bold text-white md:text-5xl">
            새 태스크 생성
          </h1>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4">
            <p className="text-base font-semibold text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="taskName"
              className="mb-2 block text-sm font-semibold text-slate-300"
            >
              태스크 이름 <span className="text-red-400">*</span>
            </label>
            <input
              id="taskName"
              type="text"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="태스크 이름을 입력하세요"
              className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-white placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              required
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label
              htmlFor="taskDescription"
              className="mb-2 block text-sm font-semibold text-slate-300"
            >
              태스크 설명 <span className="text-red-400">*</span>
            </label>
            <textarea
              id="taskDescription"
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="태스크에 대한 상세 설명을 입력하세요"
              rows={6}
              className="w-full resize-none rounded-xl border border-white/10 bg-slate-900/60 p-4 text-white placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="startAt"
                className="mb-2 block text-sm font-semibold text-slate-300"
              >
                시작일
              </label>
              <input
                id="startAt"
                type="date"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-white focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label
                htmlFor="endAt"
                className="mb-2 block text-sm font-semibold text-slate-300"
              >
                종료일
              </label>
              <input
                id="endAt"
                type="date"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-white focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <ButtonLink href={`/teams/${teamId || ""}`} variant="secondary">
              취소
            </ButtonLink>
            <Button
              type="submit"
              disabled={
                isSubmitting || !taskName.trim() || !taskDescription.trim()
              }
            >
              {isSubmitting ? "생성 중..." : "태스크 생성"}
            </Button>
          </div>
        </form>
      </section>
    </TeamsPageLayout>
  );
}
