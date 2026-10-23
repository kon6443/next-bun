import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamsPageLayout } from "@/app/teams/components";
import { StageScreen } from "../../components/StageScreen";
import { CAMPAIGN, stageMeta } from "../../lib/campaign";

type StagePageProps = { params: Promise<{ stageId: string }> };

export function generateStaticParams() {
  return CAMPAIGN.map((stage) => ({ stageId: stage.id }));
}

export async function generateMetadata({ params }: StagePageProps): Promise<Metadata> {
  const { stageId } = await params;
  const stage = stageMeta(stageId);
  return { title: stage ? `타워 디펜스 스테이지 ${stage.number}` : "타워 디펜스" };
}

/** 스테이지 화면 (defense DESIGN §F1) — 난이도 선택 → 플레이 */
export default async function DefenseStagePage({ params }: StagePageProps) {
  const { stageId } = await params;
  const stage = stageMeta(stageId);
  if (!stage) notFound();
  return (
    <TeamsPageLayout>
      <Link href="/games/defense" className="flex min-h-11 items-center text-sm text-slate-400">
        ← 캠페인 지도
      </Link>
      <StageScreen stage={stage} />
      {/* 하단 내비(떠 있는 카드형 — 바닥 띄움 + 안쪽 여백으로 공통 6rem 여백보다 조금 높다)에 마지막 항목이 가리지 않게 */}
      <div aria-hidden="true" className="h-8" />
    </TeamsPageLayout>
  );
}
