import { getFeedbackCategoryLabel, getFeedbackStatusMeta } from "@/app/config/feedbackConfig";

const badgeBase = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold";

export function FeedbackCategoryBadge({ category }: { category: string }) {
  return (
    <span className={`${badgeBase} border-indigo-400/30 bg-indigo-500/15 text-indigo-200`}>
      {getFeedbackCategoryLabel(category)}
    </span>
  );
}

export function FeedbackStatusBadge({ status }: { status: string }) {
  const { label, badgeClassName } = getFeedbackStatusMeta(status);
  return <span className={`${badgeBase} ${badgeClassName}`}>{label}</span>;
}
