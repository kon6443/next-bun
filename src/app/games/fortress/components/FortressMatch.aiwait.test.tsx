// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// 실제 훅을 쓰되 "카메라가 다음 발을 컷 없이 따라갈 수 있나"만 바꿔 끼운다(함수는 훅처럼 렌더마다 같은 것)
const camera = vi.hoisted(() => {
  const state = { ready: false, metas: [] as unknown[] };
  return { state, readyFor: () => state.ready };
});
vi.mock("../hooks/useBattleView", async (importOriginal) => {
  const real = await importOriginal<typeof import("../hooks/useBattleView")>();
  return {
    ...real,
    useBattleView: (opts: Parameters<typeof real.useBattleView>[0]) => {
      const view = real.useBattleView(opts);
      // 연출에 넘긴 meta(무기)를 기록한다 — play는 그대로 부른다
      const play: typeof view.play = (...args) => (camera.state.metas.push(args[3]), view.play(...args));
      return { ...view, play, cameraReadyFor: camera.readyFor };
    },
  };
});

// AI가 수를 고른 횟수 — 기다리는 동안 다시 고르지 않는지 본다
const ai = vi.hoisted(() => ({ calls: 0, actions: [] as unknown[] }));
vi.mock("../ai/chooseTurn", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/chooseTurn")>();
  return {
    ...real,
    chooseTurn: (...args: Parameters<typeof real.chooseTurn>) => {
      ai.calls++;
      const action = real.chooseTurn(...args);
      ai.actions.push(action);
      return action;
    },
  };
});

import type { MatchConfig } from "../engine";
import { CAMERA_WAIT_MAX_MS } from "../lib/cameraWait";
import { FortressMatch } from "./FortressMatch";

const config: MatchConfig = { seed: 7, mapId: "hills", mode: "ffa", players: [{ slot: 0, team: 0, tankId: 0 }, { slot: 1, team: 0, tankId: 1 }] };
const AI_DELAY_MS = 450;
const phase = () => screen.getByTestId("fortress-match").getAttribute("data-phase");

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "requestAnimationFrame", "cancelAnimationFrame"] }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AI 발사 — 카메라 대기 (D-024)", () => {
  it("생각(450ms) 뒤에도 카메라가 다음 발을 따라갈 자리에 없으면 기다리고, 상한(1초)이 지나면 쏜다", async () => {
    camera.state.ready = false;
    render(<FortressMatch config={config} controllers={[1, 1]} onExit={() => {}} onFinish={() => {}} />);
    expect(phase()).toBe("think");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AI_DELAY_MS + CAMERA_WAIT_MAX_MS - 100);
    });
    expect(phase()).toBe("think");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(phase()).toBe("play");
  });

  it("기다리는 중에 카메라가 준비되면 상한을 기다리지 않고 바로 쏜다", async () => {
    camera.state.ready = false;
    render(<FortressMatch config={config} controllers={[1, 1]} onExit={() => {}} onFinish={() => {}} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AI_DELAY_MS + 300);
    });
    expect(phase()).toBe("think");
    camera.state.ready = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(phase()).toBe("play");
  });

  it("기다리는 1초 동안 수는 처음 한 번만 고른다", async () => {
    camera.state.ready = false;
    ai.calls = 0;
    render(<FortressMatch config={config} controllers={[1, 1]} onExit={() => {}} onFinish={() => {}} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AI_DELAY_MS + CAMERA_WAIT_MAX_MS - 100);
    });
    expect(phase()).toBe("think");
    expect(ai.calls).toBe(1);
  });

  it("기다리는 중 나가기 확인을 열면 쏘지 않는다(상한이 지나도)", async () => {
    camera.state.ready = false;
    render(<FortressMatch config={config} controllers={[1, 1]} onExit={() => {}} onFinish={() => {}} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AI_DELAY_MS + 300);
    });
    act(() => fireEvent.click(screen.getByRole("button", { name: "설정으로" })));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(phase()).toBe("think");
  });

  it("카메라가 준비돼 있으면(움직임 줄이기 포함) 생각 시간(450ms)만에 쏜다", async () => {
    camera.state.ready = true;
    render(<FortressMatch config={config} controllers={[1, 1]} onExit={() => {}} onFinish={() => {}} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AI_DELAY_MS + 60);
    });
    expect(phase()).toBe("play");
  });
});

describe("경기 연출의 무기 (D-025 B)", () => {
  it("쏜 행동의 weaponId를 play의 meta로 넘긴다 — 시안의 무기별 탄·폭발", async () => {
    camera.state.ready = true;
    camera.state.metas = [];
    ai.actions = [];
    render(<FortressMatch config={config} controllers={[1, 1]} onExit={() => {}} onFinish={() => {}} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AI_DELAY_MS + 100);
    });
    expect(phase()).toBe("play");
    const action = ai.actions[0] as { kind: string; weaponId?: number };
    expect(action.kind).toBe("fire");
    expect(camera.state.metas[0]).toEqual({ weaponId: action.weaponId });
  });
});
