// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { type Action, type MatchConfig, type MatchState, applyAction, createMatch, stateHash } from "../engine";
import type { MatchFeed } from "../battle-ui/lib/matchFeed";

/** 캔버스 연출은 jsdom에서 끝나지 않는다 — 연출 끝(onPlaybackEnd)을 테스트가 직접 부른다 */
const playback = vi.hoisted(() => ({ end: null as null | (() => void) }));
vi.mock("../hooks/useBattleView", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/useBattleView")>();
  return {
    ...actual,
    useBattleView: ({ onPlaybackEnd }: { onPlaybackEnd: (next: MatchState) => void }) => {
      const onEnd = useRef(onPlaybackEnd);
      onEnd.current = onPlaybackEnd;
      return {
        containerRef: useRef(null),
        canvasRef: useRef(null),
        canvasHandlers: {},
        play: (_before: MatchState, _events: unknown, next: MatchState) => {
          playback.end = () => onEnd.current(next);
        },
        show: () => {
          playback.end = null;
        },
        setPaused: () => {},
        following: true,
        recenter: () => {},
      };
    },
  };
});
const endPlayback = () =>
  act(() => {
    const end = playback.end;
    playback.end = null;
    end?.();
  });

const { FortressMatch } = await import("./FortressMatch");
type OnlineLink = import("./FortressMatch").OnlineLink;
type Controller = import("./FortressMatch").Controller;

/** 온라인 경기(F5) — 서버 피드로만 진행: 내 차례 제출 · 피드 행동 적용 · 해시 대조 · 스냅샷 재구성 */
const config: MatchConfig = {
  seed: 7,
  mapId: "hills",
  mode: "ffa",
  players: [
    { slot: 0, team: 0, tankId: 0 },
    { slot: 1, team: 0, tankId: 1 },
  ],
};
const first = createMatch(config);
if (!first.ok) throw new Error(first.reason);
const firstSlot = first.state.turn.slot;
const otherSlot = 1 - firstSlot;
const pass = (weaponId = 0): Action => ({ kind: "fire", move: 0, angle: 60, power: 0, weaponId });
const hashAfter = (actions: Action[]) => {
  let s = first.state;
  for (const a of actions) {
    const r = applyAction(s, a);
    if (!r.ok) throw new Error(r.reason);
    s = r.state;
  }
  return stateHash(s);
};

const feed = (patch: Partial<MatchFeed> = {}): MatchFeed => ({
  matchId: "m1",
  engineVersion: 1,
  config,
  slots: [
    { slot: 0, playerId: "a", name: "가나", skin: { id: "default", level: 1 } },
    { slot: 1, playerId: "b", name: "다라", skin: { id: "default", level: 1 } },
  ],
  actions: [],
  hashes: [],
  turn: { seq: 0, turnNo: 1, slot: firstSlot, deadlineAt: "", turnMs: 22000, remainingMs: 20000 },
  turnAt: Date.now(),
  startAt: 0,
  ended: null,
  epoch: 1,
  needsResync: false,
  ...patch,
});

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
beforeEach(() => window.localStorage.setItem("fortress:guide:v1", "1"));
afterEach(cleanup);

function setup(mySlot: number, initial: MatchFeed, submitImpl: OnlineLink["submit"] = async () => ({ ok: true })) {
  const submit = vi.fn<OnlineLink["submit"]>(submitImpl);
  const resync = vi.fn<OnlineLink["resync"]>();
  const cfg = initial.config;
  const names = cfg.players.map((p) => `P${p.slot + 1}`);
  const link = (f: MatchFeed): OnlineLink => ({ mySlot, names, feed: f, submit, resync, errorMessage: (c) => c });
  const controllers: Controller[] = cfg.players.map((p) => (p.slot === mySlot ? "human" : "remote"));
  const ui = render(<FortressMatch config={cfg} controllers={[...controllers]} online={link(initial)} onExit={() => {}} onFinish={() => {}} />);
  const rerender = (f: MatchFeed) => ui.rerender(<FortressMatch config={cfg} controllers={[...controllers]} online={link(f)} onExit={() => {}} onFinish={() => {}} />);
  return { submit, resync, rerender };
}

/** 3인 개인전 — 턴 주인이 아닌 사람이 기권해도 경기가 이어진다 */
const config3: MatchConfig = { ...config, players: [...config.players, { slot: 2, team: 0, tankId: 2 }] };
const first3 = createMatch(config3);
if (!first3.ok) throw new Error(first3.reason);
const turnSlot3 = first3.state.turn.slot;
const resignSlot3 = (turnSlot3 + 1) % 3;
const resign3: Action = { kind: "resign", slot: resignSlot3 };
const hash3 = (actions: Action[]) => {
  let s = first3.state;
  for (const a of actions) {
    const r = applyAction(s, a);
    if (!r.ok) throw new Error(r.reason);
    s = r.state;
  }
  return stateHash(s);
};
const feed3 = (patch: Partial<MatchFeed> = {}) =>
  feed({ config: config3, slots: [], turn: { seq: 0, turnNo: 1, slot: turnSlot3, deadlineAt: "", turnMs: 22000, remainingMs: 20000 }, ...patch });
const afterResign3 = () => feed3({ actions: [resign3], hashes: [hash3([resign3])], turn: { seq: 1, turnNo: 1, slot: turnSlot3, deadlineAt: "", turnMs: 22000, remainingMs: 19000 } });
const root = () => screen.getByTestId("fortress-match");

describe("FortressMatch 온라인", () => {
  it("재접속(이미 확정된 행동으로 시작) — 내 지난 발(각도·파워·착탄 눈금)을 피드 행동으로 다시 만든다", () => {
    const mine: Action = { kind: "fire", move: 0, angle: 50, power: 70, weaponId: 0 };
    const actions = [mine, pass()];
    setup(firstSlot, feed({ actions, hashes: [hashAfter([mine]), hashAfter(actions)], turn: { seq: 2, turnNo: 3, slot: firstSlot, deadlineAt: "", turnMs: 22000, remainingMs: 20000 } }));
    expect(screen.getByTestId("fortress-last-shot").textContent).toBe("지난 발 ▶ 오른쪽 50° · 70");
    expect(screen.getByTestId("fortress-last-power")).toBeTruthy();
  });

  it("스냅샷 재구성(epoch 변경) — 지난 발을 새 행동 목록으로 다시 만든다", () => {
    const { rerender } = setup(firstSlot, feed());
    expect(screen.queryByTestId("fortress-last-shot")).toBeNull();
    const mine: Action = { kind: "fire", move: 0, angle: 40, power: 66, weaponId: 0 };
    const actions = [mine, pass()];
    rerender(feed({ epoch: 2, actions, hashes: [hashAfter([mine]), hashAfter(actions)], turn: { seq: 2, turnNo: 3, slot: firstSlot, deadlineAt: "", turnMs: 22000, remainingMs: 20000 } }));
    expect(screen.getByTestId("fortress-last-shot").textContent).toBe("지난 발 ▶ 오른쪽 40° · 66");
  });


  it("내 차례 — 발사는 바로 적용하지 않고 서버에 제출(seq는 컨텍스트가 붙인다)", () => {
    const { submit } = setup(firstSlot, feed());
    fireEvent.click(screen.getByTestId("fortress-fire"));
    expect(submit).toHaveBeenCalledWith({ move: 0, angle: 60, power: 60, weaponId: 0 });
    expect(root().getAttribute("data-applied")).toBe("0");
    expect(root().getAttribute("data-phase")).toBe("submit");
  });

  it("남의 차례에는 입력이 없고, 시작 연출 동안(startAt 전)도 쏠 수 없다", () => {
    setup(otherSlot, feed());
    expect(screen.queryByTestId("fortress-fire")).toBeNull();
    cleanup();
    const { submit } = setup(firstSlot, feed({ startAt: Date.now() + 60_000 }));
    fireEvent.click(screen.getByTestId("fortress-fire"));
    expect(submit).not.toHaveBeenCalled();
  });

  it("피드에 확정된 행동을 적용한다 — 해시가 같으면 resync하지 않는다", () => {
    const { resync, rerender } = setup(otherSlot, feed());
    const action = pass();
    rerender(feed({ actions: [action], hashes: [hashAfter([action])], turn: { seq: 1, turnNo: 2, slot: otherSlot, deadlineAt: "", turnMs: 22000, remainingMs: 20000 } }));
    expect(root().getAttribute("data-applied")).toBe("1");
    expect(root().getAttribute("data-phase")).toBe("play");
    expect(resync).not.toHaveBeenCalled();
  });

  it("스냅샷(epoch 변경) — 연출 없이 다시 만들고, 서버 해시와 다르면 적용 수·내 해시를 실어 resync", () => {
    const { resync, rerender } = setup(otherSlot, feed());
    const actions = [pass(), pass(1)];
    rerender(feed({ epoch: 2, actions, hashes: [undefined, "deadbeef"], turn: { seq: 2, turnNo: 3, slot: firstSlot, deadlineAt: "", turnMs: 22000, remainingMs: 20000 } }));
    expect(root().getAttribute("data-applied")).toBe("2");
    expect(root().getAttribute("data-state-hash")).toBe(hashAfter(actions));
    expect(resync).toHaveBeenCalledWith({ seq: 2, clientHash: hashAfter(actions) });
  });

  it("재접속으로 이미 행동이 있는 피드로 시작하면 그 state에서 시작한다", () => {
    const actions = [pass(), pass(1), pass()];
    setup(firstSlot, feed({ actions, hashes: [undefined, undefined, hashAfter(actions)], turn: { seq: 3, turnNo: 4, slot: otherSlot, deadlineAt: "", turnMs: 22000, remainingMs: 20000 } }));
    expect(root().getAttribute("data-applied")).toBe("3");
    expect(root().getAttribute("data-state-hash")).toBe(hashAfter(actions));
  });

  it("내가 조준하는 중에 남이 기권하면 연출 뒤에도 조준값을 지킨다(같은 턴)", () => {
    const { rerender } = setup(turnSlot3, feed3());
    fireEvent.change(screen.getByTestId("fortress-power"), { target: { value: "30" } });
    rerender(afterResign3());
    expect(root().getAttribute("data-phase")).toBe("play");
    endPlayback();
    expect(root().getAttribute("data-phase")).toBe("aim");
    expect((screen.getByTestId("fortress-power") as HTMLInputElement).value).toBe("30");
  });

  it("제출 응답을 기다리는 중에 남이 기권해도 다시 쏠 수 없다(제출 대기 유지)", () => {
    const { submit, rerender } = setup(turnSlot3, feed3(), () => new Promise(() => {}));
    fireEvent.click(screen.getByTestId("fortress-fire"));
    rerender(afterResign3());
    endPlayback();
    expect(root().getAttribute("data-phase")).toBe("submit");
    fireEvent.click(screen.getByTestId("fortress-fire"));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("남의 기권 연출 중에 제출 실패가 오면 연출 뒤 제출 대기에 갇히지 않고 오류를 보인다", async () => {
    let fail: (r: Awaited<ReturnType<OnlineLink["submit"]>>) => void = () => {};
    const { rerender } = setup(turnSlot3, feed3(), () => new Promise((resolve) => (fail = resolve)));
    fireEvent.click(screen.getByTestId("fortress-fire"));
    rerender(afterResign3());
    expect(root().getAttribute("data-phase")).toBe("play");
    await act(async () => fail({ ok: false, code: "ACTION_REJECTED" }));
    endPlayback();
    expect(root().getAttribute("data-phase")).toBe("aim");
    expect(screen.getByRole("alert").textContent).toBe("ACTION_REJECTED");
  });

  it("제출 대기 중 기권 연출 도중 스냅샷이 와도(아직 내 차례) 제출 대기를 지킨다", () => {
    const { rerender } = setup(turnSlot3, feed3(), () => new Promise(() => {}));
    fireEvent.click(screen.getByTestId("fortress-fire"));
    rerender(afterResign3());
    rerender({ ...afterResign3(), epoch: 2 });
    expect(root().getAttribute("data-phase")).toBe("submit");
  });

  it("내 엔진이 거부한 행동 뒤에는 다시 적용하지 않고, 새 행동이 올 때마다 resync만 다시 요청한다", () => {
    const { resync, rerender } = setup(otherSlot, feed());
    const bad: Action = { kind: "resign", slot: 9 };
    const t = (seq: number) => ({ seq, turnNo: seq + 1, slot: firstSlot, deadlineAt: "", turnMs: 22000, remainingMs: 20000 });
    rerender(feed({ actions: [bad], hashes: ["x"], turn: t(1) }));
    expect(resync).toHaveBeenCalledTimes(1);
    rerender(feed({ actions: [bad], hashes: ["x"], turn: t(1) }));
    expect(resync).toHaveBeenCalledTimes(1);
    for (let n = 2; n <= 4; n++) rerender(feed({ actions: Array.from({ length: n }, () => bad), hashes: [], turn: t(n) }));
    expect(resync).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("fortress-desync")).toBeTruthy();
    expect(root().getAttribute("data-applied")).toBe("0");
  });

  it("스냅샷으로도 해시가 계속 안 맞으면 resync를 멈추고 새로고침을 안내한다", () => {
    const { resync, rerender } = setup(otherSlot, feed());
    const actions = [pass(), pass(1)];
    for (let epoch = 2; epoch <= 7; epoch++) {
      rerender(feed({ epoch, actions, hashes: [undefined, "deadbeef"], turn: { seq: 2, turnNo: 3, slot: firstSlot, deadlineAt: "", turnMs: 22000, remainingMs: 20000 } }));
    }
    expect(resync).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("fortress-desync")).toBeTruthy();
  });

  it("새로고침 안내가 뜨면 열려 있던 나가기 확인을 닫는다(inert 영역 안에 갇히지 않게)", () => {
    const { rerender } = setup(otherSlot, feed());
    fireEvent.click(screen.getByRole("button", { name: "나가기" }));
    expect(screen.getByText("경기를 나갈까요?")).toBeTruthy();
    const actions = [pass(), pass(1)];
    for (let epoch = 2; epoch <= 5; epoch++) rerender(feed({ epoch, actions, hashes: [undefined, "deadbeef"], turn: { seq: 2, turnNo: 3, slot: firstSlot, deadlineAt: "", turnMs: 22000, remainingMs: 20000 } }));
    expect(screen.getByTestId("fortress-desync")).toBeTruthy();
    expect(screen.queryByText("경기를 나갈까요?")).toBeNull();
  });

  it("시작 전 제출 거절(MATCH_NOT_STARTED) — 기다리지 않고 조준으로 돌아가 안내, 다시 쏠 수 있다", async () => {
    const { submit } = setup(firstSlot, feed(), async () => ({ ok: false, code: "MATCH_NOT_STARTED" }));
    await act(async () => {
      fireEvent.click(screen.getByTestId("fortress-fire"));
    });
    expect(root().getAttribute("data-phase")).toBe("aim");
    expect(screen.getByRole("alert").textContent).toBe("MATCH_NOT_STARTED");
    await act(async () => {
      fireEvent.click(screen.getByTestId("fortress-fire"));
    });
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("제출 오류는 내 다음 차례가 오면 지운다", async () => {
    const { rerender } = setup(firstSlot, feed(), async () => ({ ok: false, code: "TURN_EXPIRED" }));
    await act(async () => {
      fireEvent.click(screen.getByTestId("fortress-fire"));
    });
    expect(screen.getByRole("alert").textContent).toBe("TURN_EXPIRED");
    const skip: Action = { kind: "skip" };
    rerender(feed({ actions: [skip], hashes: [hashAfter([skip])], turn: { seq: 1, turnNo: 2, slot: otherSlot, deadlineAt: "", turnMs: 22000, remainingMs: 20000 } }));
    endPlayback();
    expect(screen.getByRole("alert").textContent).toBe("TURN_EXPIRED"); // 남의 턴 동안은 남긴다
    rerender(feed({ actions: [skip, skip], hashes: [hashAfter([skip]), hashAfter([skip, skip])], turn: { seq: 2, turnNo: 3, slot: firstSlot, deadlineAt: "", turnMs: 22000, remainingMs: 20000 } }));
    endPlayback();
    expect(screen.getByRole("alert").textContent).toBe("");
  });
});
