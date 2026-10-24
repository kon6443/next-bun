import type { Metadata } from "next";
import { gamePageMetadata } from "@/app/games/_shared/lib/seo";
import { BattleMatchArchive } from "../../../battle-ui/components/BattleMatchArchive";

export const metadata: Metadata = gamePageMetadata({
  title: "테트리스 대전 기록 — 1:1·최대 4인 대전 다시보기",
  description: "최근 온라인 테트리스 대전 기록. 1:1부터 4인 대전까지 저장된 경기를 모든 판 동시 재생으로 다시 보세요.",
  path: "/games/tetris/battle/matches",
});

/** 최근 대전 전체 목록 (DESIGN §19) — 소켓 없이 REST로 */
export default function BattleMatchesPage() {
  return <BattleMatchArchive />;
}
