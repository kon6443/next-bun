import { notFound } from "next/navigation";
import FeedbackDetailView from "./FeedbackDetailView";

type FeedbackDetailPageProps = {
  params: Promise<{ feedbackId: string }>;
};

export default async function FeedbackDetailPage({ params }: FeedbackDetailPageProps) {
  const { feedbackId } = await params;
  // 양의 정수가 아니면 백엔드에 묻지 않고 404
  if (!/^[1-9]\d*$/.test(feedbackId)) notFound();
  return <FeedbackDetailView feedbackId={Number(feedbackId)} />;
}
