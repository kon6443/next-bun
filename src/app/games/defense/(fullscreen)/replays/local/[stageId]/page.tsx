import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocalReplayView } from "../../../../components/ReplayScreens";
import { CAMPAIGN } from "../../../../lib/campaign";

export const metadata: Metadata = {
  title: "타워 디펜스 다시보기",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ stageId: string }> };

/** 캠페인 로컬 다시보기 — 이 기기에 저장된 스테이지별 최고 판(§F7, 서버 기록 아님) */
export default async function DefenseLocalReplayPage({ params }: PageProps) {
  const { stageId } = await params;
  if (!CAMPAIGN.some((s) => s.id === stageId)) notFound();
  return <LocalReplayView stageId={stageId} />;
}
