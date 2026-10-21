"use client";

import { useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import {
  TeamsPageLayout,
  Button,
  ButtonLink,
  SectionLabel,
  FormPageSkeleton,
} from "@/app/teams/components";
import { cardStyles } from "@/styles/teams";
import { useAuthenticatedFetch } from "@/app/hooks/useAuthenticatedFetch";
import { formatFullDateTime } from "@/app/utils/taskUtils";
import { getFeedbackDetail } from "@/services/feedbackService";
import { ApiError } from "@/types/api";
import { LoginRequiredCard } from "../components/LoginRequiredCard";
import { FeedbackCategoryBadge, FeedbackStatusBadge } from "../components/FeedbackBadges";

type FeedbackDetailViewProps = {
  feedbackId: number;
};

export default function FeedbackDetailView({ feedbackId }: FeedbackDetailViewProps) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated" && !!session?.user?.accessToken;

  const fetchDetail = useCallback(
    async (accessToken: string) => (await getFeedbackDetail(feedbackId, accessToken)).data,
    [feedbackId],
  );
  // 없거나 남의 피드백(404)은 다시 시도해도 같다 — 재시도 대신 목록으로 안내한다
  const [isNotFound, setIsNotFound] = useState(false);
  const { data: feedback, isLoading, error, refetch } = useAuthenticatedFetch(fetchDetail, {
    onSuccess: () => setIsNotFound(false),
    onError: (err) => setIsNotFound(err instanceof ApiError && err.isNotFoundError()),
  });

  if (status !== "loading" && !isAuthenticated) {
    return (
      <TeamsPageLayout>
        <LoginRequiredCard description="로그인하면 내가 보낸 피드백과 답변을 확인할 수 있어요." />
      </TeamsPageLayout>
    );
  }

  return (
    <TeamsPageLayout>
      <div className="flex items-center justify-between">
        <ButtonLink href="/feedback/me" variant="secondary">
          ← 내 피드백
        </ButtonLink>
      </div>

      {isLoading ? (
        <FormPageSkeleton />
      ) : isNotFound ? (
        <section className={`${cardStyles.section} px-6 py-10 text-center`} role="alert">
          <p className="text-base font-semibold text-white">피드백을 찾을 수 없어요.</p>
          <p className="mt-2 text-sm text-slate-400">삭제되었거나 내가 보낸 피드백이 아닐 수 있어요.</p>
          <ButtonLink href="/feedback/me" size="md" className="mt-5">
            내 피드백 목록으로
          </ButtonLink>
        </section>
      ) : error || !feedback ? (
        <section className={`${cardStyles.errorSection} px-6 py-10 text-center`} role="alert">
          <p className="text-base font-semibold text-red-300">{error ?? "피드백을 불러오지 못했습니다."}</p>
          <Button variant="secondary" size="sm" className="mt-5 min-h-11" onClick={refetch}>
            다시 시도
          </Button>
        </section>
      ) : (
        <>
          {/* 본문 */}
          <section className={`${cardStyles.section} p-4`}>
            <div className="flex flex-wrap items-center gap-2">
              <FeedbackCategoryBadge category={feedback.category} />
              <FeedbackStatusBadge status={feedback.status} />
            </div>
            <h1 className="mt-3 break-words text-2xl font-bold text-white">{feedback.title}</h1>
            <p className="mt-2 text-xs text-slate-500">
              <time dateTime={feedback.createdAt}>{formatFullDateTime(new Date(feedback.createdAt))}</time>
            </p>
            {/* 마크다운이 아닌 일반 텍스트 — 줄바꿈만 보존 */}
            <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-200">
              {feedback.content}
            </p>
          </section>

          {/* 운영자 답변 */}
          <section className={`${cardStyles.section} p-4`}>
            <SectionLabel spacing="tight">운영자 답변</SectionLabel>
            {feedback.adminReply ? (
              <>
                {feedback.repliedAt && (
                  <p className="mt-3 text-xs text-slate-500">
                    <time dateTime={feedback.repliedAt}>{formatFullDateTime(new Date(feedback.repliedAt))}</time>
                  </p>
                )}
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-200">
                  {feedback.adminReply}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-400">아직 답변이 없어요.</p>
            )}
          </section>
        </>
      )}
    </TeamsPageLayout>
  );
}
