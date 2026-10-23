import { getGameScoreSummary } from "@/services/gameServerService";
// route 파일은 HTTP 메서드·segment config만 export할 수 있다(next build의 route 타입 검사) — 렌더·문구는 lib에 둔다
import { renderReplayCardImage } from "@/app/games/_shared/lib/ogCard";
import { parseScoreId } from "@/app/games/_shared/lib/share";
import { DEFENSE_SHARE } from "../../../lib/defenseShare";

/**
 * 기록 미리보기 카드 이미지 1200×630 — GET /games/defense/replays/{scoreId}/og
 * 리플레이 페이지는 route group (fullscreen) 안 — 그 안의 opengraph-image는 경로에 해시가 붙어 카카오 카드의 고정 URL로 못 쓴다(테트리스와 같은 이유)
 * 진행 중인 주간 보드 기록도 요약(입력 없음)은 공개라 카드는 그린다(D-027)
 */
type RouteContext = {
  params: Promise<{ scoreId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { scoreId } = await params;
  const id = parseScoreId(scoreId);
  const summary = id === null ? null : await getGameScoreSummary("defense", id);
  return renderReplayCardImage(DEFENSE_SHARE, summary);
}
