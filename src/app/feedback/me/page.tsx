"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import {
  TeamsPageLayout,
  Button,
  ButtonLink,
  SectionLabel,
  EmptyState,
  TeamListSkeleton,
} from "@/app/teams/components";
import { cardStyles } from "@/styles/teams";
import { FEEDBACK_PAGE_SIZE } from "@/app/config/feedbackConfig";
import { extractErrorMessage } from "@/app/utils/errorUtils";
import { formatFullDateTime } from "@/app/utils/taskUtils";
import { getMyFeedbacks } from "@/services/feedbackService";
import type { FeedbackListItem } from "@/types/feedback";
import { LoginRequiredCard } from "../components/LoginRequiredCard";
import { FeedbackCategoryBadge, FeedbackStatusBadge } from "../components/FeedbackBadges";

/**
 * 내 피드백 목록 — 첫 페이지 조회 + "더 보기"(beforeId = 마지막 feedbackId)
 */
function useMyFeedbacks(accessToken: string | undefined) {
  const [items, setItems] = useState<FeedbackListItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);
  // 첫 페이지를 다시 불러오면(재시도·토큰 갱신) 그 전에 나간 요청의 응답은 버린다
  const listEpochRef = useRef(0);

  const loadFirst = useCallback(async () => {
    if (!accessToken) return;
    const epoch = ++listEpochRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await getMyFeedbacks(accessToken, { limit: FEEDBACK_PAGE_SIZE });
      if (epoch !== listEpochRef.current) return;
      setItems(data.items);
      setHasMore(data.hasMore);
    } catch (err) {
      if (epoch !== listEpochRef.current) return;
      setError(extractErrorMessage(err, "피드백 목록을 불러오지 못했습니다."));
    } finally {
      if (epoch === listEpochRef.current) setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  const loadMore = useCallback(async () => {
    const lastId = items.at(-1)?.feedbackId;
    if (!accessToken || lastId === undefined || !hasMore || isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    const epoch = listEpochRef.current;
    try {
      const { data } = await getMyFeedbacks(accessToken, { beforeId: lastId, limit: FEEDBACK_PAGE_SIZE });
      if (epoch !== listEpochRef.current) return;
      setItems((prev) => [...prev, ...data.items]);
      setHasMore(data.hasMore);
    } catch (err) {
      if (epoch !== listEpochRef.current) return;
      toast.error(extractErrorMessage(err, "피드백을 더 불러오지 못했습니다."));
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [accessToken, items, hasMore]);

  return { items, hasMore, isLoading, error, isLoadingMore, reload: loadFirst, loadMore };
}

export default function MyFeedbacksPage() {
  const { data: session, status } = useSession();
  const accessToken = status === "authenticated" ? session?.user?.accessToken : undefined;
  const { items, hasMore, isLoading, error, isLoadingMore, reload, loadMore } = useMyFeedbacks(accessToken);

  if (status !== "loading" && !accessToken) {
    return (
      <TeamsPageLayout>
        <LoginRequiredCard description="로그인하면 내가 보낸 피드백과 답변을 확인할 수 있어요." />
      </TeamsPageLayout>
    );
  }

  return (
    <TeamsPageLayout>
      {/* 헤더 */}
      <section className={`${cardStyles.section} p-4`}>
        <div className="flex items-center justify-between gap-3">
          <ButtonLink href="/mypage" variant="secondary" size="sm">
            ← 마이페이지
          </ButtonLink>
          <ButtonLink href="/feedback" size="sm">
            새 피드백
          </ButtonLink>
        </div>
        <div className="mt-4">
          <SectionLabel spacing="wide">Feedback</SectionLabel>
          <h1 className="mt-3 text-2xl font-bold text-white">내 피드백</h1>
          <p className="mt-2 text-sm text-slate-400">보낸 피드백의 처리 상태와 답변을 확인할 수 있어요.</p>
        </div>
      </section>

      {/* 목록 */}
      <section className={`${cardStyles.section} p-4`}>
        {status === "loading" || isLoading ? (
          <TeamListSkeleton cardCount={3} />
        ) : error ? (
          <div className={`${cardStyles.errorDashedContainer} px-6 py-10 text-center`} role="alert">
            <p className="text-base font-semibold text-red-300">{error}</p>
            <Button variant="secondary" size="sm" className="mt-5 min-h-11" onClick={reload}>
              다시 시도
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            message="아직 보낸 피드백이 없어요."
            description="불편한 점이나 바라는 기능을 알려주세요."
            action={
              <ButtonLink href="/feedback" size="lg" className="mt-6">
                피드백 보내기
              </ButtonLink>
            }
          />
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-3">
              {items.map((item) => (
                <li key={item.feedbackId}>
                  <FeedbackListCard item={item} />
                </li>
              ))}
            </ul>
            {hasMore && (
              <Button
                variant="secondary"
                size="md"
                fullWidth
                className="mt-4 min-h-11"
                onClick={loadMore}
                disabled={isLoadingMore}
                aria-busy={isLoadingMore}
              >
                {isLoadingMore ? "불러오는 중..." : "더 보기"}
              </Button>
            )}
          </>
        )}
      </section>
    </TeamsPageLayout>
  );
}

function FeedbackListCard({ item }: { item: FeedbackListItem }) {
  return (
    <Link
      href={`/feedback/${item.feedbackId}`}
      className="block rounded-2xl border border-white/10 bg-slate-950/40 p-4 transition hover:border-white/30 hover:bg-slate-900/80"
    >
      <div className="flex flex-wrap items-center gap-2">
        <FeedbackCategoryBadge category={item.category} />
        <FeedbackStatusBadge status={item.status} />
        {item.hasReply && <span className="text-xs font-semibold text-sky-300">답변 있음</span>}
      </div>
      <h2 className="mt-3 line-clamp-2 break-words text-base font-semibold text-white">{item.title}</h2>
      <p className="mt-2 text-xs text-slate-500">
        <time dateTime={item.createdAt}>{formatFullDateTime(new Date(item.createdAt))}</time>
      </p>
    </Link>
  );
}
