import Link from "next/link";
import { TeamsPageLayout, SectionLabel } from "./teams/components";
import { cardStyles } from "@/styles/teams";
import { SITE_CONFIG } from "./config/siteConfig";
import { serializeJsonLd } from '@/app/utils/jsonLd';
import { GAME_CATALOG } from "./games/_shared/lib/gameCatalog";
import { GAMES_PATH } from "./games/gamesPaths";
import { BattleEntryLink } from "./games/tetris/battle-ui/components/BattleEntryLink";

const baseDomain = process.env.NEXT_PUBLIC_DOMAIN?.replace(/\/$/, "") ?? "";

const siteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_CONFIG.name,
  url: SITE_CONFIG.url,
  description: SITE_CONFIG.description,
};

/** 도구(팀 보드·타임 트래커)는 공개 도메인 기준 절대 경로 — 이전 홈과 같다 */
const toolHref = (path: string) => (baseDomain ? `${baseDomain}${path}` : path);

const TOOLS = [
  { key: "teams", title: "팀 보드", tagline: "팀 협업 · 태스크 관리", emoji: "🗂️", href: toolHref("/teams") },
  { key: "time", title: "타임 트래커", tagline: "시간 측정 · 기록", emoji: "⏱️", href: toolHref("/time-measurement") },
] as const;

/**
 * 사이트 홈 (site-home D-002) — 머리("오늘은 뭐 할까요?") → 게임 카드(GAME_CATALOG, /games와 같은 목록) → 도구 목록
 * 데스크톱은 게임 3열이 답답하지 않게 5xl 폭
 */
export default function Home() {
  return (
    <TeamsPageLayout maxWidth="5xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(siteJsonLd) }}
      />
      {/* 고정 하단 내비(데스크톱은 기본 하단 여백보다 높다)가 마지막 도구 카드를 가리지 않게 아래 여백을 더 둔다 */}
      {/* 내비가 커지는 폭(521px~, BottomNavBar.module.css)부터 여백도 키운다 */}
      <div className="flex flex-col gap-5 pb-4 min-[521px]:pb-8">
        <header className="flex items-end justify-between gap-3 px-1">
          <div>
            <SectionLabel spacing="wide">{SITE_CONFIG.name}</SectionLabel>
            <h1 className="mt-2 text-2xl font-bold text-white">오늘은 뭐 할까요?</h1>
          </div>
          <Link href={GAMES_PATH} className="flex min-h-11 shrink-0 items-center px-2 text-xs text-sky-300 hover:text-sky-200">
            게임 전체 <span aria-hidden="true">→</span>
          </Link>
        </header>

        <section aria-labelledby="home-games">
          <h2 id="home-games" className="mb-3 px-1 text-base font-semibold text-white">
            게임
          </h2>
          {/* 3열은 카드가 비좁지 않은 md부터 */}
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {GAME_CATALOG.map((game) => (
              <li key={game.key} className={`${cardStyles.section} flex flex-col overflow-hidden`}>
                <div className={`flex items-center gap-3 bg-gradient-to-br ${game.accent} p-5`}>
                  <span className="text-4xl" aria-hidden="true">
                    {game.emoji}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-xl font-semibold text-white">{game.title}</h3>
                    <p className="mt-0.5 text-xs text-slate-300">{game.tagline}</p>
                  </div>
                </div>
                {/* 버튼 줄은 카드 바닥에 — 대전 입구가 있는 카드도 플레이 줄 높이가 다른 카드와 맞게 입구를 위에 둔다 */}
                <div className="mt-auto flex flex-col gap-2 p-4">
                  {game.battleEntry ? (
                    <div className="[&>a]:mt-0">
                      <BattleEntryLink />
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <Link
                      href={game.playHref}
                      aria-label={`${game.title} 플레이`}
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
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="home-tools" className={`${cardStyles.section} p-2`}>
          <h2 id="home-tools" className="px-3 pt-2 text-xs font-semibold tracking-[0.3em] text-slate-400">
            <span aria-hidden="true">TOOLS</span>
            <span className="sr-only">도구</span>
          </h2>
          <ul>
            {TOOLS.map((tool) => (
              <li key={tool.key}>
                <Link href={tool.href} className="flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 hover:bg-slate-800/60">
                  <span className="text-xl" aria-hidden="true">
                    {tool.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white">{tool.title}</span>
                    <span className="block text-xs text-slate-400">{tool.tagline}</span>
                  </span>
                  <span className="text-slate-500" aria-hidden="true">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </TeamsPageLayout>
  );
}
