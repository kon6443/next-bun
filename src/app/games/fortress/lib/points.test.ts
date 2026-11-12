import { describe, expect, it } from "vitest";
import { formatPoints, maxPointsIfLoggedIn, playedTurns, pointsEligibility } from "./points";
import { type Action, type MatchConfig, createMatch } from "../engine";

describe("게스트 '로그인했다면' 최대 포인트(D-006 상수)", () => {
  it("참가 20,000 + 승리 30,000 + KO 10,000×최대 3", () => {
    expect(maxPointsIfLoggedIn({ won: false, kos: 0 })).toBe(20_000);
    expect(maxPointsIfLoggedIn({ won: true, kos: 1 })).toBe(60_000);
    expect(maxPointsIfLoggedIn({ won: true, kos: 5 })).toBe(80_000);
    expect(maxPointsIfLoggedIn({ won: false, kos: -1 })).toBe(20_000);
  });
  it("표기는 천 단위 쉼표 · P", () => {
    expect(formatPoints(80_000)).toBe("80,000 P");
    expect(formatPoints(-5)).toBe("0 P");
  });
});

describe("적립 조건(pointsEligibility) — 백엔드 fortress-points.rules와 같은 규칙", () => {
  const config: MatchConfig = { seed: 7, mapId: "hills", mode: "ffa", players: [{ slot: 0, team: 0, tankId: 0 }, { slot: 1, team: 0, tankId: 1 }] };
  const created = createMatch(config);
  if (!created.ok) throw new Error(created.reason);
  const first = created.state.turn.slot;
  const other = 1 - first;
  const shot = (power: number): Action => ({ kind: "fire", move: 0, angle: 60, power, weaponId: 0 });
  const eight = Array.from({ length: 8 }, () => shot(30));

  it("6턴 넘게·내 차례 실제 발사 3번 이상·기권 없음이면 대상", () => {
    expect(pointsEligibility(config, eight, first)).toEqual({ eligible: true });
    expect(pointsEligibility(config, eight, other)).toEqual({ eligible: true });
  });
  it("끝난 턴 수(playedTurns)가 6 미만이면 경기 전체가 대상 아님", () => {
    // turn.no는 0부터, 행동 하나가 턴 하나 — 3행동이면 turn.no 3, playedTurns 4
    expect(pointsEligibility(config, eight.slice(0, 3), first)).toEqual({ eligible: false, reason: "turns" });
  });
  it("넘기기(파워 0)는 실제 발사로 세지 않는다", () => {
    const passes = eight.map((a, i) => (i % 2 === 0 ? shot(0) : a));
    expect(pointsEligibility(config, passes, first)).toEqual({ eligible: false, reason: "shots" });
    expect(pointsEligibility(config, passes, other)).toEqual({ eligible: true });
  });
  it("재적용이 실패하면 그 앞까지만 센다(뒤의 발사·턴은 세지 않는다)", () => {
    // 3번째 행동이 잘못된 무기(엔진 거부) — 뒤에 행동이 더 있어도 2행동까지만 센다 → 6턴 미만
    const broken: Action[] = [eight[0], eight[1], { kind: "fire", move: 0, angle: 60, power: 30, weaponId: 99 }, ...eight.slice(3)];
    expect(pointsEligibility(config, broken, first)).toEqual({ eligible: false, reason: "turns" });
  });
  it("내 기권이 기록에 있으면 대상 아님(남의 기권은 상관없음)", () => {
    const withResign: Action[] = [...eight, { kind: "resign", slot: other }];
    expect(pointsEligibility(config, withResign, other)).toEqual({ eligible: false, reason: "resign" });
    expect(pointsEligibility(config, withResign, first)).toEqual({ eligible: true });
  });
  it("playedTurns — 승패를 낸 턴을 더하고, 턴 상한이면 그대로", () => {
    expect(playedTurns({ turn: { ...created.state.turn, no: 4 }, maxTurns: 60 })).toBe(5);
    expect(playedTurns({ turn: { ...created.state.turn, no: 60 }, maxTurns: 60 })).toBe(60);
  });
});
