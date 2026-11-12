// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { MatchConfig } from "../../engine";
import { FortressClientEvents, FortressErrorCodes, FortressServerEvents, type MatchSnapshot, type MatchStartingPayload, type TurnInfo, type TurnResolvedPayload } from "@/types/fortressSocket";

/** 포트리스 소켓 컨텍스트(F5) — 공용 방 코어를 가짜로 두고 경기 피드·resync·D-015 제출만 본다 */
type Handler = (payload: unknown) => void;
const core = vi.hoisted(() => ({
  handlers: new Map<string, Set<(payload: unknown) => void>>(),
  socketRequest: null as unknown as ReturnType<typeof vi.fn<(event: string, payload?: unknown) => Promise<unknown>>>,
  room: null as null | { code: string; status: string },
}));
const fakeSocket = {
  on: (event: string, h: Handler) => {
    if (!core.handlers.has(event)) core.handlers.set(event, new Set());
    core.handlers.get(event)!.add(h);
  },
  off: (event: string, h: Handler) => core.handlers.get(event)?.delete(h),
};
// 실제 코어처럼 요청 함수는 렌더마다 같은 참조
const stable = {
  roomRequest: vi.fn(),
  socketRequest: (event: string, payload?: unknown) => core.socketRequest(event, payload),
  registerMatchSync: () => () => {},
};
vi.mock("@/app/games/_shared/battle-room/contexts/useBattleRoomCore", () => ({
  useBattleRoomCore: () => ({ socket: fakeSocket, room: core.room, ...stable }),
  useEnterScope: () => ({}),
}));

const { FortressSocketProvider, useFortressSocket } = await import("./FortressSocketContext");

const config: MatchConfig = {
  seed: 7,
  mapId: "hills",
  mode: "ffa",
  players: [
    { slot: 0, team: 0, tankId: 0 },
    { slot: 1, team: 0, tankId: 1 },
    { slot: 2, team: 0, tankId: 2 },
  ],
};
const turn = (seq: number, slot: number, turnNo: number): TurnInfo => ({ seq, turnNo, slot, deadlineAt: "", turnMs: 22000, remainingMs: 20000 });
const starting: MatchStartingPayload = { matchId: "m1", engineVersion: 1, config, slots: [], turn: turn(0, 0, 1), startInMs: 0, startAt: "" };
const snapshot = (actions: number, t: TurnInfo | null = turn(actions, 0, actions + 1)): MatchSnapshot => ({
  matchId: "m1",
  engineVersion: 1,
  config,
  actions: Array.from({ length: actions }, () => ({ kind: "skip" as const })),
  stateHash: "h",
  turn: t,
  slots: [],
});
const resolved = (seq: number, next: TurnInfo | null, action: TurnResolvedPayload["action"] = { kind: "skip" }): TurnResolvedPayload => ({ matchId: "m1", seq, action, cause: "leave", stateHash: `h${seq}`, next });
const emit = (event: string, payload: unknown) => act(() => core.handlers.get(event)?.forEach((h) => h(payload)));
const resyncCalls = () => core.socketRequest.mock.calls.filter(([e]) => e === FortressClientEvents.RESYNC);

let ctx: ReturnType<typeof useFortressSocket>;
function Probe() {
  ctx = useFortressSocket();
  return null;
}
const mount = () =>
  render(
    <FortressSocketProvider>
      <Probe />
    </FortressSocketProvider>,
  );

beforeEach(() => {
  vi.useFakeTimers();
  core.handlers.clear();
  core.room = { code: "ABCD", status: "PLAYING" };
  core.socketRequest = vi.fn(async () => ({ ok: true, data: snapshot(0) }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("FortressSocketProvider", () => {
  it("놓친 행동을 맞추는 resync가 실패하면 간격을 두고 다시 시도한다", async () => {
    core.socketRequest = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, code: "TIMEOUT" })
      .mockResolvedValue({ ok: true, data: snapshot(3) });
    mount();
    emit(FortressServerEvents.MATCH_STARTING, starting);
    emit(FortressServerEvents.TURN_RESOLVED, resolved(2, turn(3, 0, 4))); // seq 0·1을 놓쳤다
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(resyncCalls().length).toBe(2);
    expect(ctx.feed?.actions).toHaveLength(3);
    expect(ctx.feed?.needsResync).toBe(false);
  });

  it("방이 RESULT인데 피드가 진행 중이면(끊긴 사이 경기 끝) resync로 마지막 소식을 받는다", async () => {
    const ui = mount();
    emit(FortressServerEvents.MATCH_STARTING, starting);
    expect(resyncCalls().length).toBe(0);
    core.room = { code: "ABCD", status: "RESULT" };
    ui.rerender(
      <FortressSocketProvider>
        <Probe />
      </FortressSocketProvider>,
    );
    // 정상 종료에도 방 상태가 먼저 올 수 있어 잠깐 기다린다
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(resyncCalls().length).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(resyncCalls()).toEqual([[FortressClientEvents.RESYNC, { matchId: "m1" }]]);
  });

  it("방 밖에서 온 턴 소식(피드 없음)으로는 resync하지 않고, 방 안이면 한 번만 요청한다", async () => {
    core.room = null;
    const ui = mount();
    emit(FortressServerEvents.TURN_RESOLVED, resolved(0, turn(1, 1, 2)));
    expect(resyncCalls().length).toBe(0);
    core.room = { code: "ABCD", status: "PLAYING" };
    let finish: (v: unknown) => void = () => {};
    core.socketRequest = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    ui.rerender(
      <FortressSocketProvider>
        <Probe />
      </FortressSocketProvider>,
    );
    emit(FortressServerEvents.TURN_RESOLVED, resolved(0, turn(1, 1, 2)));
    emit(FortressServerEvents.TURN_RESOLVED, resolved(1, turn(2, 2, 3)));
    expect(resyncCalls().length).toBe(1);
    await act(async () => finish({ ok: true, data: snapshot(2) }));
    expect(ctx.feed?.actions).toHaveLength(2);
  });

  it("D-015 — 남의 기권으로 seq가 밀리면 최신 seq로 한 번 다시, 그것도 어긋나면 resync", async () => {
    mount();
    emit(FortressServerEvents.MATCH_STARTING, starting);
    core.socketRequest = vi.fn(async (event: string) => (event === FortressClientEvents.TURN_SUBMIT ? { ok: false, code: FortressErrorCodes.TURN_MISMATCH } : { ok: true, data: snapshot(1, turn(1, 0, 1)) }));
    let result: unknown;
    await act(async () => {
      void ctx.submitTurn({ move: 0, angle: 60, power: 50, weaponId: 0 }).then((r) => (result = r));
    });
    emit(FortressServerEvents.TURN_RESOLVED, resolved(0, turn(1, 0, 1), { kind: "resign", slot: 2 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    const submits = core.socketRequest.mock.calls.filter(([e]) => e === FortressClientEvents.TURN_SUBMIT);
    expect(submits.map(([, p]) => (p as { seq: number }).seq)).toEqual([0, 1]);
    expect(result).toEqual({ ok: false, code: FortressErrorCodes.TURN_MISMATCH });
    expect(resyncCalls().length).toBe(1);
  });

  it("D-015 — 턴이 이미 지나갔으면 입력을 버리고, 1초 안에 소식이 없으면 resync", async () => {
    mount();
    emit(FortressServerEvents.MATCH_STARTING, starting);
    core.socketRequest = vi.fn(async (event: string) => (event === FortressClientEvents.TURN_SUBMIT ? { ok: false, code: FortressErrorCodes.TURN_MISMATCH } : { ok: true, data: snapshot(1, turn(1, 1, 2)) }));
    await act(async () => {
      void ctx.submitTurn({ move: 0, angle: 60, power: 50, weaponId: 0 });
    });
    emit(FortressServerEvents.TURN_RESOLVED, resolved(0, turn(1, 1, 2))); // 다음 사람 차례 — 지나갔다
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(core.socketRequest.mock.calls.filter(([e]) => e === FortressClientEvents.TURN_SUBMIT).length).toBe(1);
    expect(resyncCalls().length).toBe(0);

    // 새 소식 없이 1초가 지나면 resync
    await act(async () => {
      void ctx.submitTurn({ move: 0, angle: 60, power: 50, weaponId: 0 });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(resyncCalls().length).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(resyncCalls().length).toBe(1);
  });
});
