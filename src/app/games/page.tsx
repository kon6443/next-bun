import type { Metadata } from "next";
import Link from "next/link";
import { TeamsPageLayout, SectionLabel } from "@/app/teams/components";
import type { ReactNode } from "react";
import { cardStyles } from "@/styles/teams";
import { serializeJsonLd } from "@/app/utils/jsonLd";
import { gameListJsonLd, gamePageMetadata } from "./_shared/lib/seo";
import { BattleEntryLink } from "./tetris/battle-ui/components/BattleEntryLink";

type GameCard = {
  title: string;
  description: string;
  emoji: string;
  playHref: string;
  playLabel: string;
  secondary: { href: string; label: string };
  /** 새 모드 입구 — 테트리스는 대전 링크(열린 방 수 배지, 홈 대전 섹션으로) */
  feature?: ReactNode;
};

export const metadata: Metadata = gamePageMetadata({
  title: "무료 브라우저 미니게임 — 테트리스·타워 디펜스·낚시",
  description: "설치 없이 브라우저에서 바로 하는 무료 미니게임 모음 — 온라인 테트리스 랭킹·대전, 타워 디펜스, 멀티플레이어 낚시.",
  path: "/games",
});

const GAMES: GameCard[] = [
  {
    title: "테트리스",
    description: "줄을 지우고 점수를 쌓아 일간·주간·전체 랭킹에 도전하세요. 로그인 없이도 등록할 수 있어요.",
    emoji: "🧱",
    playHref: "/games/tetris",
    playLabel: "플레이",
    secondary: { href: "/games/tetris/rankings", label: "랭킹 보기" },
    feature: <BattleEntryLink />,
  },
  {
    title: "타워 디펜스",
    description: "돌 받침에 타워를 세워 몰려오는 적을 막아요. 캠페인 8스테이지를 하나씩 열어 가세요.",
    emoji: "🏰",
    playHref: "/games/defense",
    playLabel: "플레이",
    secondary: { href: "/games/defense/campaign/s1", label: "스테이지 1" },
  },
  {
    title: "낚시",
    description: "다른 사람들과 함께 강가에서 물고기를 낚는 방치형 멀티플레이 게임이에요.",
    emoji: "🎣",
    playHref: "/fishing",
    playLabel: "플레이",
    secondary: { href: "/fishing/guide", label: "물고기 도감" },
  },
];

export default function GamesPage() {
  return (
    <TeamsPageLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(gameListJsonLd(GAMES.map((game) => ({ name: game.title, path: game.playHref })))) }}
      />
      <section className={`${cardStyles.section} p-5`}>
        <SectionLabel spacing="wide">Games</SectionLabel>
        <h1 className="mt-4 text-3xl font-bold text-white">게임</h1>
        <p className="mt-2 text-sm text-slate-400">브라우저에서 바로 즐기는 미니게임이에요.</p>
      </section>

      <ul className="grid grid-cols-1 gap-4">
        {GAMES.map((game) => (
          <li key={game.title} className={`${cardStyles.section} p-5`}>
            <div className="flex items-start gap-4">
              <span className="text-4xl" aria-hidden="true">
                {game.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold text-white">{game.title}</h2>
                <p className="mt-1.5 text-sm text-slate-400">{game.description}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Link
                href={game.playHref}
                className="flex min-h-11 flex-1 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 hover:brightness-110"
              >
                {game.playLabel}
              </Link>
              <Link
                href={game.secondary.href}
                className="flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/20 text-sm font-semibold text-slate-200 hover:border-white/40"
              >
                {game.secondary.label}
              </Link>
            </div>
            {game.feature}
          </li>
        ))}
      </ul>
    </TeamsPageLayout>
  );
}
