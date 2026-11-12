// @vitest-environment jsdom
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Confetti, DamageBar, gradeOf, useCountUp, winnerTanks } from "./resultFlair";

const setReduced = (on: boolean) => {
  window.matchMedia = ((q: string) => ({ matches: on && q.includes("reduce"), media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
};
beforeEach(() => setReduced(false));
afterEach(cleanup);

describe("결과 화면 연출 조각 (D-025 보충 6)", () => {
  it("등급 — 준 피해 + KO×40 + 승리 60점: S 200↑ · A 120↑ · B 60↑ · C", () => {
    expect(gradeOf({ dealt: 150, kos: 0, won: true })).toBe("S");
    expect(gradeOf({ dealt: 80, kos: 1, won: false })).toBe("A");
    expect(gradeOf({ dealt: 60, kos: 0, won: false })).toBe("B");
    expect(gradeOf({ dealt: 10, kos: 0, won: false })).toBe("C");
  });

  it("움직임 줄이기면 카운트업 없이 바로 최종값, 꽃가루도 없다", () => {
    setReduced(true);
    const { result } = renderHook(() => useCountUp(87));
    expect(result.current).toBe(87);
    render(<Confetti active />);
    expect(screen.getByTestId("result-confetti").children.length).toBe(0);
  });

  it("꽃가루는 active일 때만", () => {
    render(<Confetti active={false} />);
    expect(screen.getByTestId("result-confetti").children.length).toBe(0);
    cleanup();
    render(<Confetti active />);
    expect(screen.getByTestId("result-confetti").children.length).toBeGreaterThan(0);
  });

  it("승자 탱크 — 1위만, 팀전이면 팀 색, 스킨은 그 경기 스킨(없으면 기본)", () => {
    const players = [
      { slot: 0, team: null, place: 1, name: "가" },
      { slot: 1, team: null, place: 2, name: "나" },
    ];
    const tanks = winnerTanks(players, [{ id: "neon", level: 3 }]);
    expect(tanks).toHaveLength(1);
    expect(tanks[0]).toMatchObject({ label: "가", skin: { id: "neon", level: 3 } });
    const team = winnerTanks([{ slot: 2, team: 1, place: 1, name: "다" }]);
    expect(team[0].color).toBe("#f97316");
    expect(team[0].skin.id).toBe("default");
  });

  it("피해 막대는 너비 대신 scaleX(transform만 애니메이션) — 움직임 줄이기면 바로 최종 비율", () => {
    setReduced(true);
    render(<DamageBar value={50} max={100} />);
    expect(screen.getByTestId("damage-fill").style.transform).toBe("scaleX(0.5)");
    expect(screen.getByTestId("damage-fill").style.width).toBe("");
  });
});
