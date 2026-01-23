"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { createTask } from "@/services/teamService";
import {
  TeamsPageLayout,
  ButtonLink,
  SectionLabel,
  TaskForm,
  ErrorAlert,
  type TaskFormData,
} from "../../../components";
import { cardStyles } from "@/styles/teams";

type CreateTaskPageProps = {
  params: Promise<{ teamId: string }>;
};

export default function CreateTaskPage({ params }: CreateTaskPageProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [teamId, setTeamId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setTeamId(p.teamId));
  }, [params]);

  const handleSubmit = async (data: TaskFormData) => {
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
          taskName: data.taskName,
          taskDescription: data.taskDescription,
          startAt: data.startAt ? `${data.startAt}T00:00:00` : null,
          endAt: data.endAt ? `${data.endAt}T23:59:59` : null,
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

  const handleCancel = () => {
    router.push(`/teams/${teamId || ""}`);
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
      <section className={`${cardStyles.section} p-4 sm:p-6 md:p-8`}>
        <div className="mb-4 sm:mb-6">
          <SectionLabel>New Task</SectionLabel>
          <h1 className="mt-3 sm:mt-4 text-2xl sm:text-4xl font-bold text-white md:text-5xl">
            새 태스크 생성
          </h1>
        </div>

        {error && <ErrorAlert message={error} className="mb-4 sm:mb-6" />}

        <TaskForm
          mode="create"
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          cancelHref={`/teams/${teamId || ""}`}
          isSubmitting={isSubmitting}
        />
      </section>
    </TeamsPageLayout>
  );
}
