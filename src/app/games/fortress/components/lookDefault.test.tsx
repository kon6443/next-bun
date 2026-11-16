// @vitest-environment jsdom
import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { MatchConfig } from "../engine";
import { useLook } from "../lib/look";

// glow 후처리 층(WebGL)은 대역 — 경기 화면이 넘긴 켜기 값만 본다
const glowCalls: boolean[] = [];
vi.mock("./GlowLayer", () => ({
  useGlowLayer: (enabled: boolean) => {
    glowCalls.push(enabled);
    return { onFrame: undefined, layer: null, active: false };
  },
}));

const { FortressMatch } = await import("./FortressMatch");
const { TankSkinPreview } = await import("./TankSkinPreview");

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
  glowCalls.length = 0;
  window.history.replaceState(null, "", "/");
  window.sessionStorage.clear();
});

describe("useLook — 그림은 vivid 하나(D-027 보충 1), ?look=glow만 후처리를 켠다", () => {
  it("주소에 ?look이 없거나 예전 ?look=classic이면 glow 꺼짐(vivid)", () => {
    expect(renderHook(() => useLook()).result.current).toEqual({ glow: false });
    window.history.replaceState(null, "", "/games/fortress/play?look=classic");
    expect(renderHook(() => useLook()).result.current).toEqual({ glow: false });
  });

  it("?look=glow는 그 탭에 기억해 쿼리 없는 방 주소로 옮겨도 이어진다", () => {
    window.history.replaceState(null, "", "/games/fortress/play?look=glow");
    expect(renderHook(() => useLook()).result.current).toEqual({ glow: true });
    window.history.replaceState(null, "", "/games/fortress/battle/ABCD");
    expect(renderHook(() => useLook()).result.current).toEqual({ glow: true });
  });

  it("넘긴 look이 주소보다 우선한다(혼자하기 설정 화면이 고른 값)", () => {
    window.history.replaceState(null, "", "/games/fortress/play?look=glow");
    expect(renderHook(() => useLook("vivid")).result.current).toEqual({ glow: false });
  });

  // 리뷰 확정 결함: 홈·스킨 화면에서 연 ?look=glow가 기억되지 않아 쿼리 없는 "AI와 대전" 링크로 들어가면 glow가 꺼졌다
  it("홈·스킨 화면(탱크 미리보기)에서 연 ?look=glow도 기억해, 쿼리 없는 플레이 주소로 들어가면 glow", () => {
    window.history.replaceState(null, "", "/games/fortress?look=glow");
    render(<TankSkinPreview tanks={[{ skin: { id: "default", level: 1 }, color: "#38bdf8" }]} label="내 탱크" />);
    cleanup();
    window.history.replaceState(null, "", "/games/fortress/play?vs=ai");
    expect(renderHook(() => useLook()).result.current).toEqual({ glow: true });
  });
});

describe("경기 화면 → glow 후처리 층 연결", () => {
  it("?look=glow면 useGlowLayer(true), 쿼리가 없으면 false", () => {
    window.history.replaceState(null, "", "/games/fortress/play?look=glow");
    render(<FortressMatch config={config} controllers={["human", "human"]} onExit={() => {}} onFinish={() => {}} />);
    expect(glowCalls.at(-1)).toBe(true);
    cleanup();
    glowCalls.length = 0;
    window.history.replaceState(null, "", "/games/fortress/play");
    window.sessionStorage.clear();
    render(<FortressMatch config={config} controllers={["human", "human"]} onExit={() => {}} onFinish={() => {}} />);
    expect(glowCalls.at(-1)).toBe(false);
  });
});
