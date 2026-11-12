// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchConfig, MatchState } from "../engine";

/**
 * 터치 패드 입력 경쟁(D-025 보충 2 리뷰 확정) — 누르는 동안 반복이 막힌 동안·다음 사람 차례로 새지 않는다
 * 전장은 연출을 곧 끝내는 대역(턴 전환을 빠르게)
 */
/** 연출을 시작한 횟수(= 받아들여진 행동 수) */
const plays = vi.hoisted(() => ({ count: 0 }));
vi.mock("../hooks/useBattleView", async (orig) => {
  const real = await orig<typeof import("../hooks/useBattleView")>();
  const React = await import("react");
  return {
    ...real,
    useBattleView: (o: { onPlaybackEnd: (n: MatchState) => void }) => {
      const endRef = React.useRef(o.onPlaybackEnd);
      endRef.current = o.onPlaybackEnd;
      return {
        containerRef: () => {},
        canvasRef: () => {},
        canvasHandlers: {},
        play: (_s: MatchState, _e: unknown, next: MatchState) => {
          plays.count++;
          setTimeout(() => endRef.current(next), 10);
        },
        show: () => {},
        setPaused: () => {},
        following: true,
        recenter: () => {},
        cameraReadyFor: () => true,
      };
    },
  };
});
import { FortressMatch } from "./FortressMatch";

const config: MatchConfig = { seed: 7, mapId: "hills", mode: "ffa", players: [{ slot: 0, team: 0, tankId: 0 }, { slot: 1, team: 0, tankId: 1 }] };
beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
beforeEach(() => {
  plays.count = 0;
  vi.useFakeTimers();
  window.localStorage.setItem("fortress:guide:v1", "1");
  window.matchMedia = ((q: string) => ({ matches: q === "(pointer: coarse)", media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
  // @ts-expect-error cleanup
  delete window.matchMedia;
});
const angle = () => screen.getByTestId("fortress-angle").textContent;
const turn = () => screen.getByTestId("fortress-turn").textContent;
const phase = () => screen.getByTestId("fortress-match").getAttribute("data-phase");
function pressDpad(dir: "up" | "down" | "left" | "right") {
  const pad = screen.getByTestId("game-pad-dpad");
  vi.spyOn(pad, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 150, height: 150, right: 150, bottom: 150, x: 0, y: 0, toJSON: () => ({}) });
  const at = { up: [75, 10], down: [75, 140], left: [10, 75], right: [140, 75] }[dir];
  fireEvent.pointerDown(pad, { pointerId: 1, clientX: at[0], clientY: at[1] });
  return () => fireEvent.pointerUp(pad, { pointerId: 1 });
}

describe("터치 패드 입력 경쟁 (D-025 보충 2)", () => {
  it("▲를 누른 채 다른 손가락으로 조작 안내를 열면 반복이 멈춘다", () => {
    render(<FortressMatch config={config} controllers={["human", 1]} onExit={() => {}} onFinish={() => {}} />);
    pressDpad("up");
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.click(screen.getByTestId("fortress-help"));
    const atOpen = angle();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(angle()).toBe(atOpen);
  });

  it("같은 기기 대전 — 앞 사람이 ▲를 누른 채 쏘고 넘겨도 다음 사람 포신은 그대로(기본 60°)", () => {
    render(<FortressMatch config={config} controllers={["human", "human"]} onExit={() => {}} onFinish={() => {}} />);
    const p1 = turn();
    pressDpad("up");
    act(() => { vi.advanceTimersByTime(50); });
    const fire = screen.getByTestId("pad-fire");
    fireEvent.pointerDown(fire, { pointerId: 3 });
    fireEvent.pointerUp(fire, { pointerId: 3 });
    expect(phase()).toBe("play");
    act(() => { vi.advanceTimersByTime(20); });
    expect(turn()).not.toBe(p1);
    const p2Start = angle();
    expect(p2Start).toContain("60°");
    act(() => { vi.advanceTimersByTime(1000); });
    expect(angle()).toBe(p2Start);
  });

  it("발사를 충전하는 중에 안내를 열고 떼면 쏘지 않는다", () => {
    render(<FortressMatch config={config} controllers={["human", 1]} onExit={() => {}} onFinish={() => {}} />);
    const fire = screen.getByTestId("pad-fire");
    fireEvent.pointerDown(fire, { pointerId: 3 });
    act(() => { vi.advanceTimersByTime(500); });
    fireEvent.click(screen.getByTestId("fortress-help"));
    fireEvent.pointerUp(fire, { pointerId: 3 });
    expect(phase()).toBe("aim");
  });

  // 리뷰 확정(D-025 보충 2 2차): 패드를 다시 마운트한 뒤에도 크기 관찰이 지금 패드를 봐야 한다(가로 패드 폭은 화면 높이를 따른다)
  it("차례가 바뀌어 패드가 다시 마운트돼도 크기 관찰은 지금 패드를 본다", () => {
    const observed: Element[] = [];
    const saved = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      observe(el: Element) {
        observed.push(el);
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      render(<FortressMatch config={config} controllers={["human", "human"]} onExit={() => {}} onFinish={() => {}} />);
      expect(observed).toContain(screen.getByTestId("game-pad"));
      const fire = screen.getByTestId("pad-fire");
      fireEvent.pointerDown(fire, { pointerId: 3 });
      fireEvent.pointerUp(fire, { pointerId: 3 });
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(observed).toContain(screen.getByTestId("game-pad"));
    } finally {
      globalThis.ResizeObserver = saved;
    }
  });

  // 리뷰(D-025 보충 2 4차): 충전 중 경기 화면이 사라지면(나가기 등) 패드가 취소로 뗀다 — 쏘지 않는다(고치기 전엔 사라지기 전 핸들러로 쐈다)
  it("발사를 충전하는 중 경기 화면이 사라지면 쏘지 않는다", () => {
    const view = render(<FortressMatch config={config} controllers={["human", 1]} onExit={() => {}} onFinish={() => {}} />);
    fireEvent.pointerDown(screen.getByTestId("pad-fire"), { pointerId: 3 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    view.unmount();
    expect(plays.count).toBe(0);
  });
});
