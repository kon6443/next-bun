// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 전장(캔버스·카메라)은 대역 — 연출 시작(play)과 카메라 준비 여부만 본다
const hook = vi.hoisted(() => {
  const state = { ready: false, plays: 0, onEnd: null as null | (() => void), metas: [] as ({ weaponId?: number } | undefined)[] };
  const api = {
    containerRef: { current: null },
    canvasRef: { current: null },
    canvasHandlers: {},
    play: (_b: unknown, _e: unknown, _n: unknown, meta?: { weaponId?: number }) => {
      state.plays++;
      state.metas.push(meta);
    },
    show: () => {},
    setPaused: () => {},
    following: true,
    recenter: () => {},
    cameraReadyFor: () => state.ready,
  };
  return { state, api };
});
vi.mock("../hooks/useBattleView", () => ({
  useBattleView: (opts: { onPlaybackEnd: () => void }) => {
    hook.state.onEnd = opts.onPlaybackEnd;
    return hook.api;
  },
}));

import { type Action, type MatchState, applyAction, createMatch, ENGINE_VERSION } from "../engine";
import golden from "../engine/__fixtures__/golden-matches.json";
import { CAMERA_WAIT_MAX_MS } from "../lib/cameraWait";
import { FortressReplay } from "./FortressReplay";

const config = { seed: 7, mapId: "hills" as const, mode: "ffa" as const, players: [{ slot: 0, team: 0, tankId: 0 }, { slot: 1, team: 0, tankId: 1 }] };

/** 두 사람이 한 발씩 쏜 기록 */
function twoShots(weaponId = 0): Action[] {
  const r = createMatch(config);
  if (!r.ok) throw new Error(r.reason);
  let s: MatchState = r.state;
  const actions: Action[] = [];
  for (let i = 0; i < 2; i++) {
    // 첫 발만 weaponId(슬롯 0 캐논은 0·2·4), 둘째 발(미사일)은 포탄
    const action: Action = { kind: "fire", move: 0, angle: 60, power: 50, weaponId: i === 0 ? weaponId : 0 };
    const a = applyAction(s, action);
    if (!a.ok) throw new Error(a.reason);
    actions.push(action);
    s = a.state;
  }
  return actions;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  hook.state.plays = 0;
  hook.state.onEnd = null;
  hook.state.metas = [];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function startReplay(weaponId = 0) {
  await act(async () => {
    render(<FortressReplay data={{ engineVersion: ENGINE_VERSION, config, actions: twoShots(weaponId) }} controllers={["human", "human"]} onClose={() => {}} />);
  });
  // 재생 엔진은 동적 import — 받을 때까지
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(hook.state.plays).toBe(1);
}

describe("리플레이 자동 재생 — 다음 턴 전 카메라 대기 (D-024)", () => {
  it("카메라가 다음 발을 컷 없이 따라갈 자리에 아직 없으면 기다리되, 상한(1초)이 지나면 건다", async () => {
    hook.state.ready = false;
    await startReplay();
    act(() => hook.state.onEnd?.());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CAMERA_WAIT_MAX_MS - 100);
    });
    expect(hook.state.plays).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(hook.state.plays).toBe(2);
  });

  it("기다리는 중에 카메라가 준비되면 상한을 기다리지 않고 바로 건다", async () => {
    hook.state.ready = false;
    await startReplay();
    act(() => hook.state.onEnd?.());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(hook.state.plays).toBe(1);
    hook.state.ready = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(hook.state.plays).toBe(2);
  });

  // 리뷰 확정(D-024 5차 D2): 기다리기 시작한 때가 다음 방문에 남아, 이전 턴으로 갔다 돌아오거나 일시정지 뒤 재생하면 기다리지 않고 바로 걸었다
  it("기다리는 중 이전 턴으로 갔다가 다시 그 턴에 오면 처음부터 기다린다", async () => {
    hook.state.ready = false;
    await startReplay();
    act(() => hook.state.onEnd?.());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    act(() => fireEvent.click(screen.getByTestId("fortress-replay-prev")));
    expect(hook.state.plays).toBe(2); // 턴 1(첫 턴)은 기다리지 않는다
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    act(() => hook.state.onEnd?.());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CAMERA_WAIT_MAX_MS - 100);
    });
    expect(hook.state.plays).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(hook.state.plays).toBe(3);
  });

  it("기다리는 중 일시정지했다가 재생하면 처음부터 기다린다", async () => {
    hook.state.ready = false;
    await startReplay();
    act(() => hook.state.onEnd?.());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    act(() => fireEvent.click(screen.getByTestId("fortress-replay-toggle")));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    act(() => fireEvent.click(screen.getByTestId("fortress-replay-toggle")));
    expect(hook.state.plays).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CAMERA_WAIT_MAX_MS - 100);
    });
    expect(hook.state.plays).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(hook.state.plays).toBe(2);
  });

  it("카메라가 준비돼 있으면(움직임 줄이기 포함) 기다리지 않고 바로 다음 턴", async () => {
    hook.state.ready = true;
    await startReplay();
    act(() => hook.state.onEnd?.());
    expect(hook.state.plays).toBe(2);
  });
});

describe("리플레이 연출의 무기 (D-025 B)", () => {
  it("기록의 weaponId를 play의 meta로 넘긴다 — 시안의 무기별 탄·폭발", async () => {
    await startReplay(2);
    expect(hook.state.metas[0]).toEqual({ weaponId: 2 });
  });
});

describe("리플레이 끝 화면 — 돌아가기 · 포트리스 홈", () => {
  async function playToEnd(props: { onHome?: () => void; onClose?: () => void } = {}) {
    hook.state.ready = true;
    await act(async () => {
      render(<FortressReplay data={{ engineVersion: ENGINE_VERSION, config, actions: twoShots() }} controllers={["human", "human"]} onClose={props.onClose ?? (() => {})} onHome={props.onHome} />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // 끝나기 전에는 끝 화면 버튼이 없다
    expect(screen.queryByTestId("fortress-replay-end")).toBeNull();
    act(() => hook.state.onEnd?.());
    act(() => hook.state.onEnd?.());
    expect(screen.getByTestId("fortress-replay-turn").textContent).toContain("끝");
  }

  it("onHome이 없으면(솔로·공유 페이지) 포트리스 홈은 링크, 돌아가기는 onClose", async () => {
    const onClose = vi.fn();
    await playToEnd({ onClose });
    const home = screen.getByRole("link", { name: "포트리스 홈" });
    expect(home.getAttribute("href")).toBe("/games/fortress");
    fireEvent.click(screen.getByTestId("fortress-replay-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("onHome이 있으면(온라인 방 안) 버튼으로 그 흐름(방 나가기 → 홈)을 부른다", async () => {
    const onHome = vi.fn();
    await playToEnd({ onHome });
    expect(screen.queryByRole("link", { name: "포트리스 홈" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "포트리스 홈" }));
    expect(onHome).toHaveBeenCalledTimes(1);
  });
});

describe("리플레이 진행 표시 — 진행한 턴 수(기록 머리 \"N턴\"과 같은 수)", () => {
  it("골든 25수: 시작 \"0 / 25턴\" → 결정타 직전 \"24 / 25턴\" → 끝 \"끝 · 25 / 25턴\"", async () => {
    hook.state.ready = true;
    const g = (golden as unknown as { name: string; config: typeof config; actions: Action[] }[]).find((c) => c.name === "ffa 2인 hills AI 중·중");
    if (!g) throw new Error("golden");
    await act(async () => {
      render(<FortressReplay data={{ engineVersion: ENGINE_VERSION, config: g.config, actions: g.actions }} controllers={[1, 1]} onClose={() => {}} />);
    });
    const label = () => screen.getByTestId("fortress-replay-turn").textContent ?? "";
    // 이동 버튼은 행동 단위 — 이름도 "턴"이 아니라 "수"
    expect(screen.getByTestId("fortress-replay-prev").getAttribute("aria-label")).toBe("이전 수");
    expect(screen.getByTestId("fortress-replay-next").getAttribute("aria-label")).toBe("다음 수");
    expect(label()).toMatch(/^0 \/ 25턴/);
    for (let i = 0; i < 25; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      act(() => hook.state.onEnd?.());
      // 첫 발은 턴을 끝낸다 — 끝난 턴 수가 실제로 오른다(늘 0인 회귀를 잡는다)
      if (i === 0) expect(label()).toMatch(/^1 \/ 25턴/);
      const m = label().match(/(\d+) \/ (\d+)턴/);
      expect(m && Number(m[1]) <= Number(m[2])).toBe(true);
      // 결정타를 걸기 직전(24수 뒤) — 아직 결정 전이라 25가 아니다
      if (i === 23) expect(label()).toMatch(/^24 \/ 25턴/);
    }
    expect(label()).toMatch(/^끝 · 25 \/ 25턴/);
  });
});
