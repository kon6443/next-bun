import { ImageResponse } from "next/og";
import type { ScoreSummary } from "@/types/game";
import { loadKoreanFont } from "./ogFont";
import { OG_SIZE, cardText, needsKoreanFont } from "./replayCard";
import type { ReplayShareSpec } from "./shareSpec";

/**
 * 기록 미리보기 카드 이미지 1200×630 — 서버 전용 (게임별 replays/[scoreId]/og/route.tsx가 부른다)
 *
 * 한글 폰트를 못 받으면 ASCII 카드로 그린다(외부 네트워크 없이도 이미지가 나오게). 이모지는 외부 조회를 부르므로 쓰지 않는다
 */
/**
 * OG 카드 캐시 — ImageResponse 기본값(1년 immutable)을 덮어쓴다. 리플레이·대전 카드 공용
 * - 정상 카드 10분: 순위가 바뀌고 운영자 숨김이 있다. 공유 캐시(CDN)에도 같은 10분, 지나면 하루까지는 낡은 카드를 주며 뒤에서 새로 그린다
 *   — 크롤러·카카오가 몰릴 때 satori 렌더와 요약 조회(Next 서버 IP 하나로 전역 스로틀에 집계, Q-S5)를 줄인다 (games-polish FE-47)
 * - 폴백 카드(조회·폰트 일시 실패) 1분: 낡은 것을 오래 주지 않게 swr 없이
 */
export const OG_CACHE_OK = "public, max-age=600, s-maxage=600, stale-while-revalidate=86400";
export const OG_CACHE_FALLBACK = "public, max-age=60, s-maxage=60";

export async function renderReplayCardImage<D>(spec: ReplayShareSpec<D>, summary: ScoreSummary<D> | null): Promise<ImageResponse> {
  const koreanCard = spec.card(summary, true);
  const font = needsKoreanFont(koreanCard) ? await loadKoreanFont(cardText(koreanCard)) : null;
  const card = spec.card(summary, font !== null);

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
            <div style={{ display: "flex", fontSize: 150, fontWeight: 700, color: "#f8fafc", lineHeight: 1 }}>
              {spec.fallback.cardTitle}
            </div>
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
      headers: { "cache-control": summary && font ? OG_CACHE_OK : OG_CACHE_FALLBACK },
    },
  );
}
