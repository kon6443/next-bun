import type { Metadata } from "next";
import { parseHighlightId } from "@/app/games/_shared/lib/rankingParams";
import { gamePageMetadata } from "@/app/games/_shared/lib/seo";
import RankingsView from "./RankingsView";

/** 받을 수 있는 ?board= — 형식이 아니면 기본 랭킹 */
const TETRIS_BOARD_PARAM = /^(daily|daily-\d{4}-\d{2}-\d{2}|challenge-[1-9]\d{0,14})$/;

export const metadata: Metadata = gamePageMetadata({
  title: "테트리스 랭킹 — 일간·주간·전체 순위와 리플레이",
  description: "온라인 테트리스 일간·주간·전체 랭킹. 상위 기록과 많이 본 리플레이를 바로 다시 보세요.",
  path: "/games/tetris/rankings",
});

type RankingsPageProps = {
  searchParams: Promise<{ highlight?: string | string[]; board?: string | string[] }>;
};

/** ?board= daily(오늘의 테트리스)·daily-YYYY-MM-DD·challenge-{원본 id}(도전장) · ?highlight= 강조할 기록 */
export default async function RankingsPage({ searchParams }: RankingsPageProps) {
  const { highlight, board } = await searchParams;
  const highlightId = parseHighlightId(highlight);
  const boardParam = typeof board === "string" && TETRIS_BOARD_PARAM.test(board) ? board : null;
  return <RankingsView highlightId={highlightId} boardParam={boardParam} />;
}
