import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReplayPlayer from "./ReplayPlayer";

export const metadata: Metadata = {
  title: "테트리스 리플레이",
  robots: { index: false, follow: false },
};

type ReplayPageProps = {
  params: Promise<{ scoreId: string }>;
};

export default async function ReplayPage({ params }: ReplayPageProps) {
  const { scoreId } = await params;
  // 양의 정수가 아니면 백엔드에 묻지 않고 404
  if (!/^[1-9]\d*$/.test(scoreId)) notFound();
  return <ReplayPlayer scoreId={Number(scoreId)} />;
}
