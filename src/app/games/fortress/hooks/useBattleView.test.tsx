// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chooseTurn } from "../ai/chooseTurn";
import { type MatchConfig, type MatchState, applyAction } from "../engine";
import { startMatch } from "../lib/matchFlow";
import type { Scene } from "../renderer/drawScene";

/**
 * useBattleView 직접 테스트(리팩토링 안전망) — 캔버스·그리기는 가짜로 두고, 연출 틱 진행·소리 신호·연출 끝·일시정지·show를 본다
 * requestAnimationFrame은 손으로 돌린다(frame(now))
 */
const scenes: Scene[] = [];
vi.mock("../renderer/drawScene", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../renderer/drawScene")>()),
  drawScene: (_ctx: unknown, scene: Scene) => scenes.push(scene),
}));
vi.mock("../renderer/terrainLayer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../renderer/terrainLayer")>()),
  createTerrainLayer: () => null,
}));
vi.mock("./useFortressCanvas", async () => {
  const { useRef } = await import("react");
  return {
    useFortressCanvas: () => ({
      containerRef: useRef(null),
      canvasRef: useRef(null),
      ctxRef: useRef({ canvas: null }),
      viewRef: useRef({ width: 390, height: 520 }),
    }),
  };
});

const { useBattleView } = await import("./useBattleView");

const config: MatchConfig = { seed: 5, mapId: "hills", mode: "ffa", players: [{ slot: 0, team: 0, tankId: 0 }, { slot: 1, team: 1, tankId: 0 }] };

let callbacks: FrameRequestCallback[] = [];
let now = 1000;
/** 한 프레임(ms 만큼 시간이 흐른 뒤) */
const frame = (ms = 16) => {
  now += ms;
  const run = callbacks;
  callbacks = [];
  act(() => run.forEach((cb) => cb(now)));
};

beforeEach(() => {
  scenes.length = 0;
  callbacks = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    callbacks.push(cb);
    return callbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(performance, "now").mockImplementation(() => now);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup() {
  const initial = startMatch(config);
  const action = chooseTurn(initial, initial.turn.slot, 2, 11);
  const r = applyAction(initial, action);
  if (!r.ok) throw new Error("행동 거부");
  const onPlaybackEnd = vi.fn<(next: MatchState) => void>();
  const onCues = vi.fn();
  const hook = renderHook(() => useBattleView({ initial, onPlaybackEnd, onCues }));
  return { initial, action, events: r.events, next: r.state, onPlaybackEnd, onCues, hook };
}

describe("useBattleView", () => {
  it("연출 — 틱이 끝까지 가면 onPlaybackEnd(next) 한 번, 날던 탄이 그려지고, 소리 신호는 발사·착탄(+피격) 순서로", () => {
    const { initial, action, events, next, onPlaybackEnd, onCues, hook } = setup();
    frame();
    act(() => hook.result.current.play(initial, events, next, { weaponId: action.kind === "fire" ? action.weaponId : undefined }));
    for (let i = 0; i < 2000 && onPlaybackEnd.mock.calls.length === 0; i++) frame(50);
    expect(onPlaybackEnd).toHaveBeenCalledTimes(1);
    expect(onPlaybackEnd).toHaveBeenCalledWith(next);
    expect(scenes.some((s) => s.shells.length > 0)).toBe(true);
    const kinds = onCues.mock.calls.flatMap(([cues]) => cues.map((c: { kind: string }) => c.kind));
    expect(kinds[0]).toBe("fire");
    expect(kinds.filter((k) => k === "fire")).toHaveLength(1);
    expect(kinds).toContain("explode");
    if (events.some((e) => e.type === "damage")) expect(kinds).toContain("hit");
    // 끝난 뒤 프레임은 다음 state를 그린다(연출 없음)
    frame();
    expect(scenes.at(-1)?.shells).toEqual([]);
    expect(scenes.at(-1)?.activeSlot).toBe(next.result.kind === "ongoing" ? next.turn.slot : null);
  });

  it("일시정지 중엔 틱이 멈춰 끝나지 않고, 풀면 이어서 끝난다", () => {
    const { initial, events, next, onPlaybackEnd, hook } = setup();
    frame();
    act(() => hook.result.current.play(initial, events, next));
    frame(50);
    act(() => hook.result.current.setPaused(true));
    for (let i = 0; i < 400; i++) frame(50);
    expect(onPlaybackEnd).not.toHaveBeenCalled();
    act(() => hook.result.current.setPaused(false));
    for (let i = 0; i < 2000 && onPlaybackEnd.mock.calls.length === 0; i++) frame(50);
    expect(onPlaybackEnd).toHaveBeenCalledTimes(1);
  });

  it("show — 연출을 버리고 그 state를 바로 그린다(연출 끝 콜백 없음)", () => {
    const { initial, events, next, onPlaybackEnd, hook } = setup();
    frame();
    act(() => hook.result.current.play(initial, events, next));
    frame(50);
    act(() => hook.result.current.show(next));
    for (let i = 0; i < 50; i++) frame(50);
    expect(onPlaybackEnd).not.toHaveBeenCalled();
    const last = scenes.at(-1);
    expect(last?.shells).toEqual([]);
    expect(last?.tanks.map((t) => [t.slot, t.x, t.hp])).toEqual(next.tanks.filter((t) => t !== null).map((t) => [t!.slot, t!.x, t!.hp]));
  });

  it("조준 중(연출 없음)에는 getAim의 조준을 그린다", () => {
    const initial = startMatch(config);
    const aim = { slot: initial.turn.slot, x: 100, y: 100, angle: 45, power: 50, path: null, lastImpact: null };
    renderHook(() => useBattleView({ initial, onPlaybackEnd: () => {}, getAim: () => aim }));
    frame();
    frame();
    expect(scenes.at(-1)?.aim).toBe(aim);
  });
});
