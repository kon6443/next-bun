// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ENGINE_VERSION, type MatchConfig } from "../engine";
import { FortressMatch } from "./FortressMatch";
import { FortressReplay } from "./FortressReplay";

const config: MatchConfig = { seed: 7, mapId: "hills", mode: "ffa", players: [{ slot: 0, team: 0, tankId: 0 }, { slot: 1, team: 0, tankId: 1 }] };

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  window.sessionStorage.clear();
});

const lookOf = (testId: string) => screen.getByTestId(testId).getAttribute("data-look");

describe("기본 그림 vivid (D-025 보충 5) — look을 넘기지 않는 화면(온라인 경기·리플레이)도 주소의 ?look을 따른다", () => {
  it("경기 화면: ?look이 없으면 vivid, ?look=classic이면 classic", () => {
    render(<FortressMatch config={config} controllers={["human", "human"]} onExit={() => {}} onFinish={() => {}} />);
    expect(lookOf("fortress-match")).toBe("vivid");
    cleanup();
    window.history.replaceState(null, "", "/games/fortress/play?look=classic");
    render(<FortressMatch config={config} controllers={["human", "human"]} onExit={() => {}} onFinish={() => {}} />);
    expect(lookOf("fortress-match")).toBe("classic");
    // 쿼리 없는 방 주소로 옮겨 간 온라인 경기도 그 탭에서는 classic(되돌리기 유지)
    cleanup();
    window.history.replaceState(null, "", "/games/fortress/battle/ABCD");
    render(<FortressMatch config={config} controllers={["human", "human"]} onExit={() => {}} onFinish={() => {}} />);
    expect(lookOf("fortress-match")).toBe("classic");
  });

  it("리플레이: ?look이 없으면 vivid, ?look=classic이면 classic", async () => {
    await act(async () => {
      render(<FortressReplay data={{ engineVersion: ENGINE_VERSION, config, actions: [] }} controllers={["human", "human"]} onClose={() => {}} />);
    });
    await act(async () => await new Promise((r) => setTimeout(r, 0)));
    expect(lookOf("fortress-replay")).toBe("vivid");
    cleanup();
    window.history.replaceState(null, "", "/games/fortress/battle/matches/x?look=classic");
    await act(async () => {
      render(<FortressReplay data={{ engineVersion: ENGINE_VERSION, config, actions: [] }} controllers={["human", "human"]} onClose={() => {}} />);
    });
    await act(async () => await new Promise((r) => setTimeout(r, 0)));
    expect(lookOf("fortress-replay")).toBe("classic");
  });

  it("넘긴 look이 주소보다 우선한다(혼자하기 설정 화면이 고른 값)", () => {
    window.history.replaceState(null, "", "/games/fortress/play?look=classic");
    render(<FortressMatch config={config} controllers={["human", "human"]} look="glow" onExit={() => {}} onFinish={() => {}} />);
    expect(lookOf("fortress-match")).toBe("glow");
  });
});
