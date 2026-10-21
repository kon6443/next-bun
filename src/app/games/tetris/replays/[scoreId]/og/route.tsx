import { ImageResponse } from "next/og";
import { getGameScoreSummary } from "@/services/gameServerService";
// route 파일은 HTTP 메서드·segment config만 export할 수 있다(next build의 route 타입 검사) — 상수는 lib에 둔다
import { OG_SIZE, buildReplayCard, cardText, needsKoreanFont } from "../../../lib/replayCard";
import { loadKoreanFont } from "../../../lib/ogFont";
import { parseScoreId } from "../../../lib/share";

/**
 * 기록 미리보기 카드 이미지 1200×630 — GET /games/tetris/replays/{scoreId}/og
 *
 * 리플레이 페이지(route group (fullscreen) 안)에 opengraph-image 파일을 두면 Next가 경로에 해시 접미사를 붙인다
 * (/replays/12/opengraph-image-1x9bpl). 카카오 피드 카드에 넣을 고정 URL이 필요해 group 밖 route handler로 둔다.
 * og:image는 페이지의 generateMetadata가 이 URL로 명시한다.
 *
 * 한글 폰트를 못 받으면 ASCII 카드로 그린다(외부 네트워크 없이도 이미지가 나오게). 이모지는 외부 조회를 부르므로 쓰지 않는다
 */
/** 기록 카드는 순위가 바뀌므로 10분, 폴백 카드(일시 실패 가능)는 1분만 — ImageResponse 기본값(1년 immutable)을 덮어쓴다 */
const CACHE_OK = "public, max-age=600";
const CACHE_FALLBACK = "public, max-age=60";

type RouteContext = {
  params: Promise<{ scoreId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { scoreId } = await params;
  const id = parseScoreId(scoreId);
  const summary = id === null ? null : await getGameScoreSummary("tetris", id);

  const font = needsKoreanFont(summary) ? await loadKoreanFont(cardText(buildReplayCard(summary, true))) : null;
  const card = buildReplayCard(summary, font !== null);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 80px",
          background: "linear-gradient(135deg, #020617 0%, #0f172a 55%, #1e1b4b 100%)",
          color: "#e2e8f0",
          fontFamily: font ? "NotoSansKR" : "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#38bdf8", letterSpacing: 2 }}>
          {card.eyebrow}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {card.name && (
            <div style={{ display: "flex", fontSize: 60, fontWeight: 700, color: "#f8fafc", marginBottom: 8 }}>
              {card.name}
            </div>
          )}
          {card.score ? (
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <span style={{ fontSize: 150, fontWeight: 700, color: "#fbbf24", lineHeight: 1 }}>{card.score}</span>
              <span style={{ fontSize: 56, fontWeight: 700, color: "#fcd34d", marginLeft: 16 }}>{card.scoreUnit}</span>
            </div>
          ) : (
            <div style={{ display: "flex", fontSize: 150, fontWeight: 700, color: "#f8fafc", lineHeight: 1 }}>TETRIS</div>
          )}
          <div style={{ display: "flex", fontSize: 40, color: "#94a3b8", marginTop: 24 }}>{card.stats}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 32, fontWeight: 700, color: "#64748b" }}>
          {card.footer}
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: font ? [{ name: "NotoSansKR", data: font, weight: 700, style: "normal" }] : undefined,
      headers: { "cache-control": summary && font ? CACHE_OK : CACHE_FALLBACK },
    },
  );
}
