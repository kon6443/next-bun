import type { Metadata } from "next";
import Link from "next/link";
import { SectionLabel, TeamsPageLayout } from "@/app/teams/components";
import { cardStyles } from "@/styles/teams";
import { GameAbout } from "@/app/games/_shared/components/GameAbout";
import { gamePageMetadata, videoGameJsonLd } from "@/app/games/_shared/lib/seo";
import { CampaignMap } from "./components/CampaignMap";
import { HubActions } from "./components/HubActions";
import { RankedCards } from "./components/RankedCards";

const DESCRIPTION = "설치 없이 브라우저에서 바로 하는 무료 타워 디펜스 게임. 캠페인 8스테이지, 시즌 랭킹 무한 모드, 모두 같은 맵으로 겨루는 주간 도전.";

export const metadata: Metadata = gamePageMetadata({
  title: "브라우저 타워 디펜스 게임 — 무료 캠페인·무한 모드·주간 도전",
  description: DESCRIPTION,
  path: "/games/defense",
});

/** 디펜스 허브 (defense DESIGN §F1) — 이어하기·등록 대기 · 무한·주간 카드 · 캠페인 지도 */
export default function DefenseHubPage() {
  return (
    <TeamsPageLayout>
      <section className={`${cardStyles.section} p-5`}>
        <SectionLabel spacing="wide">Games</SectionLabel>
        <h1 className="mt-4 text-3xl font-bold text-white">타워 디펜스</h1>
        <p className="mt-2 text-sm text-slate-400">돌 받침에 타워를 세워 몰려오는 적을 막으세요. 스테이지를 깨면 다음 스테이지가 열려요.</p>
      </section>
      <HubActions />
      <RankedCards />
      <section className={`${cardStyles.section} p-5`} aria-labelledby="defense-campaign-title">
        <h2 id="defense-campaign-title" className="mb-3 text-lg font-semibold text-white">
          캠페인
        </h2>
        <CampaignMap />
      </section>
      <GameAbout
        title="타워 디펜스 소개"
        paragraphs={[
          "설치 없이 브라우저에서 바로 하는 무료 타워 디펜스 게임이에요. 길가의 돌 받침에 타워를 세우고 업그레이드해 웨이브마다 몰려오는 적을 막아요.",
          "캠페인으로 타워와 적을 하나씩 익히고, 무한 모드와 주간 도전에서 랭킹에 기록을 올려 보세요. 랭킹 기록은 리플레이로 다시 볼 수 있어요.",
        ]}
        features={[
          "캠페인 8스테이지 — 쉬움·보통·어려움 난이도",
          "무한 모드 — 시즌 랭킹, 5웨이브마다 증강 선택",
          "주간 도전 — 모두 같은 맵·규칙으로 겨루는 주간 랭킹",
          "타워 업그레이드와 분기, 지상·공중 적과 보스",
          "랭킹 기록 리플레이 — 배속·구간 이동",
        ]}
        jsonLd={videoGameJsonLd({ name: "타워 디펜스", description: DESCRIPTION, path: "/games/defense", genre: ["전략", "타워 디펜스"] })}
      />
      <p className="text-center text-xs text-slate-500">
        <Link href="/games" className="underline">
          게임 목록
        </Link>
      </p>
      {/* 하단 내비(떠 있는 카드형 — 바닥 띄움 + 안쪽 여백으로 공통 6rem 여백보다 조금 높다)에 마지막 항목이 가리지 않게 */}
      <div aria-hidden="true" className="h-8" />
    </TeamsPageLayout>
  );
}
