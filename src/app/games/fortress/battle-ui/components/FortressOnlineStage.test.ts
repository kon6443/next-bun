import { describe, expect, it } from "vitest";
import type { MatchEndedPayload, MatchResultEntry } from "@/types/fortressSocket";
import { resultHeadline, slotSkins } from "./FortressOnlineStage";

const entry = (playerId: string, place: number, team: 0 | 1 | null = null): MatchResultEntry => ({ playerId, name: playerId, slot: 0, team, hp: 50, damage: 0, kos: 0, place });
const ended = (result: MatchEndedPayload["result"], players: MatchResultEntry[]): MatchEndedPayload => ({ matchId: "m", result, players });

describe("결과 제목", () => {
  it("결과 전에는 정리 중", () => expect(resultHeadline(null, "a")).toBe("결과를 정리하는 중…"));
  it("무승부 — 모두 1위여도 '무승부'(턴 상한 같은 HP)", () => {
    expect(resultHeadline(ended({ kind: "draw" }, [entry("a", 1), entry("b", 1)]), "a")).toBe("무승부");
  });
  it("개인전 혼자 1위 → 이겼어요, 공동 1위(턴 상한 승자 HP 같음)는 공동 1위, 나머지는 n위", () => {
    expect(resultHeadline(ended({ kind: "win", slots: [0] }, [entry("a", 1), entry("b", 2)]), "a")).toBe("이겼어요!");
    expect(resultHeadline(ended({ kind: "win", slots: [0, 1] }, [entry("a", 1), entry("b", 1), entry("c", 3)]), "a")).toBe("공동 1위");
    expect(resultHeadline(ended({ kind: "win", slots: [0] }, [entry("a", 1), entry("b", 2)]), "b")).toBe("2위");
  });
  it("팀전 — 같은 팀 2명이 1위면 이겼어요", () => {
    expect(resultHeadline(ended({ kind: "win", team: 0, slots: [0, 2] }, [entry("a", 1, 0), entry("c", 1, 0), entry("b", 2, 1), entry("d", 2, 1)]), "a")).toBe("이겼어요!");
  });
});

describe("slot별 스킨(slotSkins) — 경기 시작 때 고정한 slots[].skin", () => {
  const config = { seed: 1, mapId: "hills" as const, mode: "ffa" as const, players: [0, 1, 2].map((slot) => ({ slot, team: 0, tankId: 0 })) };
  const player = (playerId: string, skin: { id: string; level: number }) => ({ playerId, name: playerId, extra: { team: null, tankId: 0, skin } }) as never;

  it("경기 중 나가 roomState에 없는 참가자도 slots[].skin으로 그린다", () => {
    const slots = [
      { slot: 0, playerId: "a", name: "A", skin: { id: "neon", level: 3 } },
      { slot: 1, playerId: "b", name: "B", skin: { id: "desert", level: 2 } },
      { slot: 2, playerId: "c", name: "C", skin: { id: "arctic", level: 1 } },
    ];
    // b는 나가서 방 목록에 없다
    expect(slotSkins({ config, slots }, [player("a", { id: "neon", level: 3 }), player("c", { id: "arctic", level: 1 })])).toEqual([
      { id: "neon", level: 3 },
      { id: "desert", level: 2 },
      { id: "arctic", level: 1 },
    ]);
  });

  it("방 플레이어의 지금 장착이 달라도(결과 단계 재입장) 시작 때 값 — 모르는 id는 기본", () => {
    const slots = [
      { slot: 0, playerId: "a", name: "A", skin: { id: "neon", level: 3 } },
      { slot: 1, playerId: "b", name: "B", skin: { id: "gold", level: 9 } },
    ];
    expect(slotSkins({ config: { ...config, players: config.players.slice(0, 2) }, slots }, [player("a", { id: "desert", level: 5 })])).toEqual([
      { id: "neon", level: 3 },
      { id: "default", level: 1 },
    ]);
  });
});
