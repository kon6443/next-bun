// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MatchConfig } from "../engine";

// FortressMatch는 렌더마다 useAimKeys를 한 번 부른다 — 이 호출 수로 FortressMatch 전체 렌더를 센다
const renders = { count: 0 };
vi.mock("../hooks/useAimKeys", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/useAimKeys")>();
  return {
    ...actual,
    useAimKeys: (...args: Parameters<typeof actual.useAimKeys>) => {
      renders.count++;
      return actual.useAimKeys(...args);
    },
  };
});

import { FortressMatch } from "./FortressMatch";

const config: MatchConfig = {
  seed: 7,
  mapId: "hills",
  mode: "ffa",
  players: [
    { slot: 0, team: 0, tankId: 0 },
    { slot: 1, team: 0, tankId: 1 },
  ],
};

/** 화면 프레임을 손으로 진행한다 — 충전 루프(rAF)만 돌리고, 캔버스는 getContext가 null이라 그리지 않는다 */
let frames: FrameRequestCallback[] = [];
let clock = 1000;
function step(ms: number) {
  clock += ms;
  const due = frames;
  frames = [];
  due.forEach((cb) => cb(clock));
}

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
beforeEach(() => {
  window.localStorage.setItem("fortress:guide:v1", "1");
  frames = [];
  clock = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("FortressMatch 충전 — 화면 전체를 다시 그리지 않는다 (B7)", () => {
  it("스페이스를 1.6초 누르는 동안 파워 표시는 매 프레임 오르지만 FortressMatch는 전환(시작·표시 시작)에서만 다시 그린다", () => {
    render(<FortressMatch config={config} controllers={["human", 1]} onExit={() => {}} onFinish={() => {}} />);
    const fire = screen.getByTestId("fortress-fire");
    act(() => {
      fireEvent.keyDown(window, { key: " ", code: "Space" });
    });
    const before = renders.count;
    const shown: string[] = [];
    // 100프레임 ≈ 1.6초(충전 끝까지)
    for (let i = 0; i < 100; i++) {
      act(() => step(16));
      shown.push(fire.textContent ?? "");
    }
    const during = renders.count - before;
    // 표시는 계속 오른다 — 마지막엔 파워 100
    expect(shown.at(-1)).toMatch(/^파워 100/);
    expect(new Set(shown).size).toBeGreaterThan(50);
    // 예전엔 파워가 바뀔 때마다(약 85번) 다시 그렸다 — 이제는 표시 시작 한 번
    expect(during).toBeLessThanOrEqual(2);
    act(() => {
      fireEvent.keyUp(window, { key: " ", code: "Space" });
    });
    // 놓으면 그 파워로 쏜다(발사 버튼 이름에 쓴 파워)
    expect(screen.getByTestId("fortress-fire")).toHaveAccessibleName(/^발사 100,/);
  });
});
