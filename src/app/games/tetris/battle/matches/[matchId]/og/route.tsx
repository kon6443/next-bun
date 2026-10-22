import { getBattleMatchSummary } from "@/services/gameServerService";
import { isBattleMatchId } from "@/services/tetrisBattleService";
// route 파일은 HTTP 메서드·segment config만 export할 수 있다(next build의 route 타입 검사) — 렌더는 lib에 둔다
import { renderBattleCardImage } from "../../../../battle-ui/lib/battleOgCard";

/**
 * 대전 경기 미리보기 카드 1200×630 — GET /games/tetris/battle/matches/{matchId}/og
 * 경기 페이지는 route group (fullscreen) 안이라 opengraph-image를 두면 경로에 해시 접미사가 붙는다 —
 * 카카오 피드 카드에 넣을 고정 URL이 필요해 group 밖 route handler로 둔다 (리플레이 og와 같은 이유)
 */
type RouteContext = {
  params: Promise<{ matchId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { matchId } = await params;
  const match = isBattleMatchId(matchId) ? await getBattleMatchSummary(matchId) : null;
  return renderBattleCardImage(match);
}
