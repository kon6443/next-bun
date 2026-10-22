import type { Metadata } from "next";
import Link from "next/link";
import { SectionLabel, TeamsPageLayout } from "@/app/teams/components";
import { cardStyles } from "@/styles/teams";
import { CampaignMap } from "./components/CampaignMap";

export const metadata: Metadata = {
  title: "타워 디펜스",
  description: "타워를 세워 웨이브를 막는 디펜스 게임 — 캠페인 8스테이지.",
};

/** 디펜스 허브 (defense DESIGN §F1, F1a 최소) — 캠페인 지도. 무한·주간·랭킹은 F2 */
export default function DefenseHubPage() {
  return (
    <TeamsPageLayout>
      <section className={`${cardStyles.section} p-5`}>
        <SectionLabel spacing="wide">Games</SectionLabel>
        <h1 className="mt-4 text-3xl font-bold text-white">타워 디펜스</h1>
        <p className="mt-2 text-sm text-slate-400">돌 받침에 타워를 세워 몰려오는 적을 막으세요. 스테이지를 깨면 다음 스테이지가 열려요.</p>
      </section>
      <section className={`${cardStyles.section} p-5`} aria-labelledby="defense-campaign-title">
        <h2 id="defense-campaign-title" className="mb-3 text-lg font-semibold text-white">
          캠페인
        </h2>
        <CampaignMap />
      </section>
      <p className="text-center text-xs text-slate-500">
        무한 모드·주간 도전·랭킹은 준비 중이에요 ·{" "}
        <Link href="/games" className="underline">
          게임 목록
        </Link>
      </p>
    </TeamsPageLayout>
  );
}
