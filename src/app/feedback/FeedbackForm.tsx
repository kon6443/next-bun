"use client";

import { useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  TeamsPageLayout,
  Button,
  ButtonLink,
  Input,
  TextArea,
  SectionLabel,
  FormPageSkeleton,
} from "@/app/teams/components";
import { cardStyles } from "@/styles/teams";
import { FEEDBACK_CATEGORIES, FEEDBACK_LIMITS } from "@/app/config/feedbackConfig";
import { isFeedbackDraftValid, toBuildSha } from "@/app/utils/feedbackUtils";
import { extractErrorMessage } from "@/app/utils/errorUtils";
import { createFeedback } from "@/services/feedbackService";
import { ApiError } from "@/types/api";
import type { FeedbackCategory } from "@/types/feedback";
import { LoginRequiredCard } from "./components/LoginRequiredCard";

// NEXT_PUBLIC_ 값은 빌드 때 인라인된다 — 리터럴로 읽어야 한다 (Dockerfile ARG로 주입, 없으면 생략)
const BUILD_SHA = toBuildSha(process.env.NEXT_PUBLIC_BUILD_SHA);

type FeedbackFormProps = {
  /** 피드백 화면 진입 직전 경로 (없으면 생략) */
  pagePath?: string;
};

/** 429는 백엔드 메시지 대신 코드별 한국어 안내 (FEEDBACK_RATE_LIMITED·TOO_MANY_REQUESTS) */
function getSubmitErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 429) return err.getDefaultMessage();
  return extractErrorMessage(err, "피드백을 보내지 못했습니다.");
}

export default function FeedbackForm({ pagePath }: FeedbackFormProps) {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 상태 반영 전 연타로 두 번 나가지 않게 동기 잠금
  const isSubmittingRef = useRef(false);

  const accessToken = session?.user?.accessToken;
  const isValid = isFeedbackDraftValid({ category, title, content });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !category || !isValid || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      await createFeedback(
        {
          category,
          title: title.trim(),
          content: content.trim(),
          pagePath,
          buildSha: BUILD_SHA,
        },
        accessToken,
      );
      toast.success("피드백을 보냈어요. 소중한 의견 감사합니다!");
      // 이동하는 동안 다시 제출되지 않게 잠금은 풀지 않는다
      router.push("/feedback/me");
    } catch (err) {
      toast.error(getSubmitErrorMessage(err));
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <TeamsPageLayout>
        <FormPageSkeleton />
      </TeamsPageLayout>
    );
  }

  if (status !== "authenticated" || !accessToken) {
    return (
      <TeamsPageLayout>
        <LoginRequiredCard description="로그인하면 기능 제안·버그 리포트 같은 피드백을 보낼 수 있어요." />
      </TeamsPageLayout>
    );
  }

  return (
    <TeamsPageLayout>
      {/* 헤더 */}
      <section className={`${cardStyles.section} p-4`}>
        <div className="flex items-center justify-between gap-3">
          <SectionLabel spacing="wide">Feedback</SectionLabel>
          <ButtonLink href="/feedback/me" variant="secondary" size="sm">
            내 피드백
          </ButtonLink>
        </div>
        <h1 className="mt-4 text-2xl font-bold text-white">피드백 보내기</h1>
        <p className="mt-2 text-sm text-slate-400">
          불편한 점이나 바라는 기능을 알려주세요. 보낸 피드백과 답변은 마이페이지에서 확인할 수 있어요.
        </p>
      </section>

      {/* 작성 폼 */}
      <section className={`${cardStyles.section} p-4`}>
        <form onSubmit={handleSubmit} className="space-y-5">
          <fieldset disabled={isSubmitting}>
            <legend className="mb-2 block text-sm font-semibold text-slate-300">
              카테고리 <span className="text-red-400">*</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {FEEDBACK_CATEGORIES.map(({ key, label }) => (
                <label key={key} className="cursor-pointer">
                  <input
                    type="radio"
                    name="feedback-category"
                    value={key}
                    checked={category === key}
                    onChange={() => setCategory(key)}
                    className="peer sr-only"
                  />
                  <span className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-sm font-medium text-slate-300 transition hover:border-white/30 peer-checked:border-sky-400/60 peer-checked:bg-sky-500/20 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-sky-500/50">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <Input
              id="feedback-title"
              label="제목"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={FEEDBACK_LIMITS.titleMax}
              placeholder="한 줄로 요약해 주세요"
              disabled={isSubmitting}
              aria-describedby="feedback-title-count"
            />
            <p id="feedback-title-count" className="mt-1 text-right text-xs text-slate-500">
              {title.length}/{FEEDBACK_LIMITS.titleMax}
            </p>
          </div>

          <div>
            <TextArea
              id="feedback-content"
              label="내용"
              required
              rows={8}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={FEEDBACK_LIMITS.contentMax}
              placeholder="어떤 상황에서 무엇이 필요했는지 자세히 적어 주시면 큰 도움이 돼요"
              disabled={isSubmitting}
              aria-describedby="feedback-content-count"
            />
            <p id="feedback-content-count" className="mt-1 text-right text-xs text-slate-500">
              {content.length}/{FEEDBACK_LIMITS.contentMax}
            </p>
          </div>

          <Button type="submit" size="md" fullWidth disabled={!isValid || isSubmitting} className="min-h-11">
            {isSubmitting ? "보내는 중..." : "피드백 보내기"}
          </Button>
        </form>
      </section>
    </TeamsPageLayout>
  );
}
