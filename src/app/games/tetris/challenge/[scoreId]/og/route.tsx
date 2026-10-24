// route 파일은 HTTP 메서드·segment config만 export할 수 있다(next build의 route 타입 검사) — 렌더·상수는 lib에 둔다
import { renderReplayCardImage } from "@/app/games/_shared/lib/ogCard";
import { parseScoreId } from "@/app/games/_shared/lib/share";
import { TETRIS_SHARE } from "../../../lib/share";
import { buildChallengeCard } from "../../../lib/challenge";
import { loadChallengeTarget } from "../../../lib/challengeTarget";

/**
 * 도전장 미리보기 카드 1200×630 — GET /games/tetris/challenge/{scoreId}/og (games-growth B2)
 * 리플레이 og와 같은 이유로 route group 밖 고정 경로. 카드 틀·폰트·캐시는 공통, 문구만 도전장
 */
type RouteContext = {
  params: Promise<{ scoreId: string }>;
};

const CHALLENGE_CARD_SPEC = { ...TETRIS_SHARE, card: buildChallengeCard, fallback: { ...TETRIS_SHARE.fallback, cardTitle: "CHALLENGE" } };

export async function GET(_request: Request, { params }: RouteContext) {
  const { scoreId } = await params;
  const id = parseScoreId(scoreId);
  const summary = id === null ? null : await loadChallengeTarget(id);
  return renderReplayCardImage(CHALLENGE_CARD_SPEC, summary);
}
