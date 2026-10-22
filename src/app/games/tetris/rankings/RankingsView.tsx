"use client";

import { RankingsView } from "@/app/games/_shared/components/RankingsView";
import { TETRIS_GAME } from "../lib/game";

/** 테트리스 랭킹 — 사양(함수 포함)은 서버 page에서 넘길 수 없어 클라이언트 래퍼에서 넘긴다 */
export default function TetrisRankingsView({ highlightId }: { highlightId: number | null }) {
  return <RankingsView game={TETRIS_GAME} highlightId={highlightId} />;
}
