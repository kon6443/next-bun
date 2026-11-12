import { describe, expect, it } from "vitest";
import type { FortressMatch } from "@/services/fortressService";
import { buildFortressCard, buildFortressMetadata, buildFortressShareContent, fortressHeadline, fortressMatchPath, fortressResultHeadline, fortressStatLine } from "./fortressShare";

const player = (name: string, place: number, slot: number, team: 0 | 1 | null = null) => ({ playerId: `p${slot}`, name, slot, team, tankId: 0, hp: 50, damage: 0, kos: 0, place });
const match = (patch: Partial<FortressMatch> = {}): FortressMatch => ({
  matchId: "kYDnp6WGrJZAlFGf",
  roomName: "한판",
  mode: "ffa",
  mapId: "hills",
  seed: 1,
  engineVersion: 1,
  playerCount: 2,
  turns: 30,
  result: { kind: "win", team: null },
  startedAt: "2026-11-02T01:00:00.000Z",
  endedAt: "2026-11-02T01:10:00.000Z",
  players: [player("가나", 1, 0), player("다라", 2, 1)],
  ...patch,
});

describe("포트리스 경기 공유 문구", () => {
  it("결과 — 개인전 우승 · 팀 승리 · 무승부 · 공동 1위", () => {
    expect(fortressResultHeadline(match())).toBe("가나님 우승");
    expect(fortressResultHeadline(match({ mode: "team", result: { kind: "win", team: 1 }, players: [player("A", 1, 0, 1), player("B", 1, 1, 1), player("C", 2, 2, 0)] }))).toBe("주황 팀 승리");
    expect(fortressResultHeadline(match({ result: { kind: "draw", team: null }, players: [player("가나", 1, 0), player("다라", 1, 1)] }))).toBe("무승부");
    expect(fortressResultHeadline(match({ playerCount: 3, players: [player("가", 1, 0), player("나", 1, 1), player("다", 3, 2)] }))).toBe("가·나 공동 1위");
  });
  it("머리줄·통계 — 방 이름이 없으면 결과만", () => {
    expect(fortressHeadline(match())).toBe("한판 — 가나님 우승");
    expect(fortressHeadline(match({ roomName: null }))).toBe("가나님 우승");
    expect(fortressStatLine(match({ mode: "team", playerCount: 4, turns: 120 }))).toBe("4인 팀전 · 120턴");
  });
  it("공유 내용 — 경기 페이지 URL·카카오 카드는 고정 og 경로", () => {
    const content = buildFortressShareContent(match());
    expect(content.url).toContain(fortressMatchPath("kYDnp6WGrJZAlFGf"));
    expect(content.kakao?.imageUrl).toContain("/games/fortress/battle/matches/kYDnp6WGrJZAlFGf/og");
  });
  it("메타 — noindex, 조회 실패면 일반 문구", () => {
    expect(buildFortressMetadata("x", match()).robots).toEqual({ index: false, follow: false });
    expect(buildFortressMetadata("x", null).title).toBe("포트리스 경기 기록");
  });
  it("OG 카드 — 한글 폰트가 없으면 ASCII만(한글 이름은 P{slot+1})", () => {
    const card = buildFortressCard(match({ mode: "team", result: { kind: "win", team: 0 } }), false);
    expect(card.headline).toBe("BLUE TEAM WINS");
    expect(card.room).toBeNull();
    expect(card.standings).toBe("1. P1 · 2. P2");
    expect(buildFortressCard(match(), true).headline).toBe("가나님 우승");
    // 개인전 공동 1위 — 한글 "공동 1위"와 맞게
    expect(buildFortressCard(match({ playerCount: 3, players: [player("Ann", 1, 0), player("Bob", 1, 1), player("Cy", 3, 2)] }), false).headline).toBe("Ann & Bob TIE");
  });
});
