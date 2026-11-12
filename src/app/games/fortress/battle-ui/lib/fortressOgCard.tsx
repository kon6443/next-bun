import { ImageResponse } from "next/og";
import type { FortressMatch } from "@/services/fortressService";
import { OG_CACHE_FALLBACK, OG_CACHE_OK } from "@/app/games/_shared/lib/ogCard";
import { loadKoreanFont } from "@/app/games/_shared/lib/ogFont";
import { OG_SIZE, isAscii } from "@/app/games/_shared/lib/replayCard";
import { buildFortressCard, fortressCardText } from "./fortressShare";

/**
 * 포트리스 경기 미리보기 카드 1200×630 — 서버 전용 (battle/matches/[matchId]/og/route.tsx가 부른다)
 * 폰트·폴백·캐시 규칙은 테트리스 대전 카드(battleOgCard)와 같다. 색만 포트리스 노을
 */
export async function renderFortressCardImage(match: FortressMatch | null): Promise<ImageResponse> {
  const koreanText = fortressCardText(buildFortressCard(match, true));
  const font = isAscii(koreanText) ? null : await loadKoreanFont(koreanText);
  const card = buildFortressCard(match, font !== null);

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
          background: "linear-gradient(180deg, #070b1d 0%, #1d2252 55%, #8a4f6a 100%)",
          color: "#e2e8f0",
          fontFamily: font ? "NotoSansKR" : "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#fb923c", letterSpacing: 2 }}>{card.eyebrow}</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {card.room && <div style={{ display: "flex", fontSize: 48, fontWeight: 700, color: "#cbd5e1", marginBottom: 12 }}>{card.room}</div>}
          <div style={{ display: "flex", fontSize: 110, fontWeight: 700, color: "#fde68a", lineHeight: 1.05 }}>{card.headline}</div>
          <div style={{ display: "flex", fontSize: 40, color: "#cbd5e1", marginTop: 28 }}>{card.standings}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 32, fontWeight: 700, color: "#94a3b8" }}>{card.footer}</div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: font ? [{ name: "NotoSansKR", data: font, weight: 700, style: "normal" }] : undefined,
      headers: { "cache-control": match && font ? OG_CACHE_OK : OG_CACHE_FALLBACK },
    },
  );
}
