import type { Metadata } from "next";
import { parseHighlightId } from "@/app/games/_shared/lib/rankingParams";
import RankingsView from "./RankingsView";

export const metadata: Metadata = {
  title: "테트리스 랭킹",
  description: "테트리스 일간·주간·전체 랭킹과 리플레이",
  alternates: { canonical: "/games/tetris/rankings" },
};

type RankingsPageProps = {
  searchParams: Promise<{ highlight?: string | string[]; board?: string | string[] }>;
};

/** ?board= daily(오늘의 테트리스) 또는 daily-YYYY-MM-DD · ?highlight= 강조할 기록 */
export default async function RankingsPage({ searchParams }: RankingsPageProps) {
  const { highlight, board } = await searchParams;
  const highlightId = parseHighlightId(highlight);
  const boardParam = typeof board === "string" && (board === "daily" || /^daily-\d{4}-\d{2}-\d{2}$/.test(board)) ? board : null;
  return <RankingsView highlightId={highlightId} boardParam={boardParam} />;
}
