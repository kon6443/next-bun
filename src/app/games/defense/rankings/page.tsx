import type { Metadata } from "next";
import { parseHighlightId } from "@/app/games/_shared/lib/rankingParams";
import { DefenseRankings } from "../components/DefenseRankings";
import { BOARD_PARAM } from "../lib/rankedBoards";

export const metadata: Metadata = {
  title: "타워 디펜스 랭킹",
  description: "타워 디펜스 무한 모드·주간 도전 랭킹",
  alternates: { canonical: "/games/defense/rankings" },
};

type RankingsPageProps = {
  searchParams: Promise<{ highlight?: string | string[]; board?: string | string[] }>;
};

/** ?board= 보드 키 또는 endless·weekly(그 모드 현재 보드) · ?highlight= 강조할 기록 */
export default async function DefenseRankingsPage({ searchParams }: RankingsPageProps) {
  const { highlight, board } = await searchParams;
  const highlightId = parseHighlightId(highlight);
  const boardParam = typeof board === "string" && BOARD_PARAM.test(board) ? board : null;
  return <DefenseRankings boardParam={boardParam} highlightId={highlightId} />;
}
