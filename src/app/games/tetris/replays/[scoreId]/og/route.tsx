import { getGameScoreSummary } from "@/services/gameServerService";
// route 파일은 HTTP 메서드·segment config만 export할 수 있다(next build의 route 타입 검사) — 렌더·상수는 lib에 둔다
import { renderReplayCardImage } from "@/app/games/_shared/lib/ogCard";
import { parseScoreId } from "@/app/games/_shared/lib/share";
import { TETRIS_SHARE } from "../../../lib/share";

/**
 * 기록 미리보기 카드 이미지 1200×630 — GET /games/tetris/replays/{scoreId}/og
 *
 * 리플레이 페이지(route group (fullscreen) 안)에 opengraph-image 파일을 두면 Next가 경로에 해시 접미사를 붙인다
 * (/replays/12/opengraph-image-1x9bpl). 카카오 피드 카드에 넣을 고정 URL이 필요해 group 밖 route handler로 둔다.
 * og:image는 페이지의 generateMetadata가 이 URL로 명시한다. 카드 레이아웃·폰트·캐시는 공통(_shared/lib/ogCard)
 */
type RouteContext = {
  params: Promise<{ scoreId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { scoreId } = await params;
  const id = parseScoreId(scoreId);
  const summary = id === null ? null : await getGameScoreSummary("tetris", id);
  return renderReplayCardImage(TETRIS_SHARE, summary);
}
