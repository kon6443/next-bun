import type { Metadata } from "next";
import { gamePageMetadata } from "@/app/games/_shared/lib/seo";
import { FortressMatchArchive } from "../../../battle-ui/components/FortressMatchArchive";

export const metadata: Metadata = gamePageMetadata({
  title: "포트리스 대전 기록 — 온라인 포격전 다시보기",
  description: "최근 온라인 포트리스 대전 기록. 2~4명 개인전과 2:2 팀전 경기를 처음부터 다시 보세요.",
  path: "/games/fortress/battle/matches",
});

/** 최근 포트리스 경기 전체 목록 (F6) — 소켓 없이 REST로. 테트리스 대전 기록과 같이 색인은 두되 sitemap에는 내지 않는다(목록은 클라이언트 조회) */
export default function FortressMatchesPage() {
  return <FortressMatchArchive />;
}
