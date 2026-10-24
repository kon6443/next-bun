import type { Metadata } from "next";
import { parseHighlightId } from "@/app/games/_shared/lib/rankingParams";
import RankingsView from "./RankingsView";

export const metadata: Metadata = {
  title: "테트리스 랭킹",
  description: "테트리스 일간·주간·전체 랭킹과 리플레이",
  alternates: { canonical: "/games/tetris/rankings" },
};

type RankingsPageProps = {
  searchParams: Promise<{ highlight?: string | string[] }>;
};

export default async function RankingsPage({ searchParams }: RankingsPageProps) {
  const { highlight } = await searchParams;
  const highlightId = parseHighlightId(highlight);
  return <RankingsView highlightId={highlightId} />;
}
