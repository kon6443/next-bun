// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// 실제 훅을 쓰되 전장에 넘긴 skinOf만 붙잡는다
const captured = vi.hoisted(() => ({ skinOf: null as null | ((slot: number) => unknown) }));
vi.mock("../hooks/useBattleView", async (importOriginal) => {
  const real = await importOriginal<typeof import("../hooks/useBattleView")>();
  return {
    ...real,
    useBattleView: (opts: Parameters<typeof real.useBattleView>[0]) => {
      captured.skinOf = opts.skinOf ?? null;
      return real.useBattleView(opts);
    },
  };
});

import type { MatchFeed } from "../battle-ui/lib/matchFeed";
import type { MatchConfig } from "../engine";
import { DEFAULT_TANK_SKIN } from "../lib/tankSkins";
import { FortressMatch, type OnlineLink } from "./FortressMatch";

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
  captured.skinOf = null;
});

describe("혼자하기 경기 스킨 (D-025)", () => {
  it("넘겨받은 slot별 스킨으로 탱크를 그린다", () => {
    render(<FortressMatch config={config} controllers={["human", 1]} skins={[{ id: "neon", level: 3 }, DEFAULT_TANK_SKIN]} onExit={() => {}} onFinish={() => {}} />);
    expect(captured.skinOf?.(0)).toEqual({ id: "neon", level: 3 });
    expect(captured.skinOf?.(1)).toEqual(DEFAULT_TANK_SKIN);
  });

  it("스킨을 안 넘기면(예전 호출) 모두 기본", () => {
    render(<FortressMatch config={config} controllers={["human", 1]} onExit={() => {}} onFinish={() => {}} />);
    expect(captured.skinOf?.(0)).toEqual(DEFAULT_TANK_SKIN);
    expect(captured.skinOf?.(1)).toEqual(DEFAULT_TANK_SKIN);
  });

  // 리뷰 확정(D-025 A): 온라인은 서버가 붙인 slot 스킨이 우선 — 혼자하기 skins를 같이 넘겨도 online 쪽으로 그린다
  it("온라인이면 online.skins로 그린다(skins 프롭은 무시)", () => {
    const feed: MatchFeed = { matchId: "m1", engineVersion: 2, config, slots: [], actions: [], hashes: [], turn: null, turnAt: 0, startAt: 0, ended: null, epoch: 1, needsResync: false };
    const online: OnlineLink = { mySlot: 0, names: ["가", "나"], skins: [{ id: "desert", level: 2 }, { id: "arctic", level: 5 }], feed, submit: async () => ({ ok: true }), resync: () => {}, errorMessage: (c) => c };
    render(<FortressMatch config={config} controllers={["human", "remote"]} online={online} skins={[{ id: "neon", level: 3 }, DEFAULT_TANK_SKIN]} onExit={() => {}} onFinish={() => {}} />);
    expect(captured.skinOf?.(0)).toEqual({ id: "desert", level: 2 });
    expect(captured.skinOf?.(1)).toEqual({ id: "arctic", level: 5 });
  });
});
