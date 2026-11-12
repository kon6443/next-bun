import type { Metadata } from "next";
import Link from "next/link";
import { TeamsPageLayout, SectionLabel } from "@/app/teams/components";
import { cardStyles } from "@/styles/teams";
import { serializeJsonLd } from "@/app/utils/jsonLd";
import { gameListJsonLd, gamePageMetadata } from "./_shared/lib/seo";
import { BattleEntryLink } from "./tetris/battle-ui/components/BattleEntryLink";
import { GAME_CATALOG } from "./_shared/lib/gameCatalog";

export const metadata: Metadata = gamePageMetadata({
  title: "무료 브라우저 미니게임 — 테트리스·타워 디펜스·낚시",
  description: "설치 없이 브라우저에서 바로 하는 무료 미니게임 모음 — 온라인 테트리스 랭킹·대전, 타워 디펜스, 멀티플레이어 낚시.",
  path: "/games",
});

export default function GamesPage() {
  return (
    <TeamsPageLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(gameListJsonLd(GAME_CATALOG.map((game) => ({ name: game.title, path: game.playHref })))) }}
      />
      <section className={`${cardStyles.section} p-5`}>
        <SectionLabel spacing="wide">Games</SectionLabel>
        <h1 className="mt-4 text-3xl font-bold text-white">게임</h1>
        <p className="mt-2 text-sm text-slate-400">브라우저에서 바로 즐기는 미니게임이에요.</p>
      </section>

      <ul className="grid grid-cols-1 gap-4">
        {GAME_CATALOG.map((game) => (
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
                플레이
              </Link>
              <Link
                href={game.secondary.href}
                className="flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/20 text-sm font-semibold text-slate-200 hover:border-white/40"
              >
                {game.secondary.label}
              </Link>
            </div>
            {/* 새 모드 입구 — 테트리스는 대전 링크(열린 방 수 배지, 홈 대전 섹션으로) */}
            {game.battleEntry ? <BattleEntryLink /> : null}
          </li>
        ))}
      </ul>
    </TeamsPageLayout>
  );
}
