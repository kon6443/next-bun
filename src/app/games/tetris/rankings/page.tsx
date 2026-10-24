import type { Metadata } from "next";
import { parseHighlightId } from "@/app/games/_shared/lib/rankingParams";
import { gamePageMetadata } from "@/app/games/_shared/lib/seo";
import RankingsView from "./RankingsView";

export const metadata: Metadata = gamePageMetadata({
  title: "테트리스 랭킹 — 일간·주간·전체 순위와 리플레이",
  description: "온라인 테트리스 일간·주간·전체 랭킹. 상위 기록의 리플레이를 바로 다시 보세요.",
  path: "/games/tetris/rankings",
});

type RankingsPageProps = {
  searchParams: Promise<{ highlight?: string | string[] }>;
};

export default async function RankingsPage({ searchParams }: RankingsPageProps) {
  const { highlight } = await searchParams;
  const highlightId = parseHighlightId(highlight);
  return <RankingsView highlightId={highlightId} />;
}
