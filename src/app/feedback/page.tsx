import { toFeedbackPagePath } from "@/app/utils/feedbackUtils";
import FeedbackForm from "./FeedbackForm";

type FeedbackPageProps = {
  /** from: 피드백 화면 진입 직전 경로 (BottomNavBar가 붙인다) */
  searchParams: Promise<{ from?: string | string[] }>;
};

export default async function FeedbackPage({ searchParams }: FeedbackPageProps) {
  const { from } = await searchParams;
  return <FeedbackForm pagePath={toFeedbackPagePath(from)} />;
}
