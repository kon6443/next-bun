import { getFortressMatchSummary } from "@/services/gameServerService";
import { isFortressMatchId } from "@/services/fortressService";
// route 파일은 HTTP 메서드·segment config만 export할 수 있다(next build의 route 타입 검사) — 렌더는 lib에 둔다
import { renderFortressCardImage } from "../../../../battle-ui/lib/fortressOgCard";

/**
 * 포트리스 경기 미리보기 카드 1200×630 — GET /games/fortress/battle/matches/{matchId}/og
 * 경기 페이지는 route group (fullscreen) 안이라 opengraph-image를 두면 경로에 해시 접미사가 붙는다 —
 * 카카오 피드 카드에 넣을 고정 URL이 필요해 group 밖 route handler로 둔다 (테트리스 대전 og와 같은 이유)
 */
type RouteContext = {
  params: Promise<{ matchId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { matchId } = await params;
  const match = isFortressMatchId(matchId) ? await getFortressMatchSummary(matchId) : null;
  return renderFortressCardImage(match);
}
