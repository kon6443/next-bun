import { ImageResponse } from "next/og";
import type { BattleMatch } from "@/services/tetrisBattleService";
import { loadKoreanFont } from "@/app/games/_shared/lib/ogFont";
import { OG_SIZE, isAscii } from "@/app/games/_shared/lib/replayCard";
import { battleCardText, buildBattleCard } from "./battleShare";

/**
 * 대전 경기 미리보기 카드 1200×630 — 서버 전용 (battle/matches/[matchId]/og/route.tsx가 부른다)
 * 폰트·폴백·캐시 규칙은 _shared ogCard와 같다. 경기 단위(방 이름·우승자·순위)라 레이아웃만 따로 둔다
 */
/** 저장된 경기는 바뀌지 않지만 운영자 숨김이 있어 10분, 폴백 카드(일시 실패 가능)는 1분 */
const CACHE_OK = "public, max-age=600";
const CACHE_FALLBACK = "public, max-age=60";

export async function renderBattleCardImage(match: BattleMatch | null): Promise<ImageResponse> {
  // 한글 카드 글자로 폰트를 받고, 못 받으면 ASCII 카드 (구분점 "·"도 비ASCII라 사실상 늘 폰트를 요청한다 — 리플레이 카드와 같다)
  const koreanText = battleCardText(buildBattleCard(match, true));
  const font = isAscii(koreanText) ? null : await loadKoreanFont(koreanText);
  const card = buildBattleCard(match, font !== null);

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
          background: "linear-gradient(135deg, #020617 0%, #0f172a 55%, #3b0764 100%)",
          color: "#e2e8f0",
          fontFamily: font ? "NotoSansKR" : "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#f472b6", letterSpacing: 2 }}>{card.eyebrow}</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {card.room && <div style={{ display: "flex", fontSize: 48, fontWeight: 700, color: "#cbd5e1", marginBottom: 12 }}>{card.room}</div>}
          <div style={{ display: "flex", fontSize: 120, fontWeight: 700, color: "#fbbf24", lineHeight: 1.05 }}>{card.headline}</div>
          <div style={{ display: "flex", fontSize: 40, color: "#94a3b8", marginTop: 28 }}>{card.standings}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 32, fontWeight: 700, color: "#64748b" }}>{card.footer}</div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: font ? [{ name: "NotoSansKR", data: font, weight: 700, style: "normal" }] : undefined,
      headers: { "cache-control": match && font ? CACHE_OK : CACHE_FALLBACK },
    },
  );
}
