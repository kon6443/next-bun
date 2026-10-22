import type { Metadata } from "next";
import { BattleMatchArchive } from "../../../battle-ui/components/BattleMatchArchive";

export const metadata: Metadata = {
  title: "최근 대전 | 테트리스",
  description: "친구와 겨룬 테트리스 대전 기록 — 경기를 다시 보세요.",
};

/** 최근 대전 전체 목록 (DESIGN §19) — 소켓 없이 REST로 */
export default function BattleMatchesPage() {
  return <BattleMatchArchive />;
}
