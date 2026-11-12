import { describe, expect, it } from "vitest";
import type { MatchConfig } from "../../engine";
import type { MatchStartingPayload, TurnInfo, TurnResolvedPayload } from "@/types/fortressSocket";
import { type MatchFeed, mismatchDecision, reduceFeed, remainingMs } from "./matchFeed";

const config: MatchConfig = {
  seed: 7,
  mapId: "hills",
  mode: "ffa",
  players: [
    { slot: 0, team: 0, tankId: 0 },
    { slot: 1, team: 0, tankId: 1 },
  ],
};
const turn = (seq: number, slot = seq % 2, turnNo = seq + 1, remaining = 20000): TurnInfo => ({ seq, turnNo, slot, deadlineAt: "", turnMs: 22000, remainingMs: remaining });
const starting = (matchId = "m1"): MatchStartingPayload => ({ matchId, engineVersion: 1, config, slots: [{ slot: 0, playerId: "a", name: "A", skin: { id: "default", level: 1 } }, { slot: 1, playerId: "b", name: "B", skin: { id: "default", level: 1 } }], turn: turn(0, 0, 1, 25000), startInMs: 3000, startAt: "" });
const fire = { kind: "fire" as const, move: 0, angle: 60, power: 50, weaponId: 0 };
const resolved = (seq: number, matchId = "m1", next: TurnInfo | null = turn(seq + 1)): TurnResolvedPayload => ({ matchId, seq, action: fire, cause: "player", stateHash: `h${seq}`, next });

const start = (): MatchFeed => reduceFeed(null, { type: "starting", payload: starting(), now: 1000 }) as MatchFeed;

describe("경기 피드(reduceFeed)", () => {
  it("시작 — 첫 턴·시작 잠금(수신 + startInMs)", () => {
    const feed = start();
    expect(feed.actions).toEqual([]);
    expect(feed.turn?.seq).toBe(0);
    expect(feed.startAt).toBe(4000);
    expect(feed.epoch).toBe(1);
  });

  it("턴 확정 — seq 순서대로 쌓고 해시·다음 턴을 갱신, 이미 받은 seq는 무시", () => {
    let feed = start();
    feed = reduceFeed(feed, { type: "resolved", payload: resolved(0), now: 2000 }) as MatchFeed;
    feed = reduceFeed(feed, { type: "resolved", payload: resolved(1), now: 3000 }) as MatchFeed;
    feed = reduceFeed(feed, { type: "resolved", payload: resolved(1), now: 3500 }) as MatchFeed;
    expect(feed.actions).toHaveLength(2);
    expect(feed.hashes).toEqual(["h0", "h1"]);
    expect(feed.turn?.seq).toBe(2);
    expect(feed.turnAt).toBe(3000);
  });

  it("다른 경기(matchId)의 이벤트는 버린다", () => {
    const feed = start();
    expect(reduceFeed(feed, { type: "resolved", payload: resolved(0, "other"), now: 2000 })).toBe(feed);
    expect(reduceFeed(feed, { type: "ended", payload: { matchId: "other", result: { kind: "draw" }, players: [] } })).toBe(feed);
  });

  it("seq가 건너뛰면 쌓지 않고 resync가 필요하다고 표시", () => {
    const feed = reduceFeed(start(), { type: "resolved", payload: resolved(2), now: 2000 }) as MatchFeed;
    expect(feed.actions).toHaveLength(0);
    expect(feed.needsResync).toBe(true);
  });

  it("스냅샷 — 통째로 바꾸고 epoch를 올린다(마지막 해시만 안다), 같은 경기의 결과는 남긴다", () => {
    let feed = start();
    feed = reduceFeed(feed, { type: "ended", payload: { matchId: "m1", result: { kind: "draw" }, players: [] } }) as MatchFeed;
    feed = reduceFeed(feed, {
      type: "snapshot",
      snapshot: { matchId: "m1", engineVersion: 1, config, actions: [fire, fire, fire], stateHash: "hx", turn: turn(3), slots: [] },
      now: 9000,
    }) as MatchFeed;
    expect(feed.actions).toHaveLength(3);
    expect(feed.hashes).toEqual([undefined, undefined, "hx"]);
    expect(feed.epoch).toBe(2);
    expect(feed.startAt).toBe(9000);
    expect(feed.ended).not.toBeNull();
  });

  it("시작 연출 중 받은 스냅샷(첫 턴 seq 0) — 남은 연출 동안 입력을 잠근다(재접속으로 카운트다운을 건너뛰지 않게)", () => {
    // 턴 길이 22000 + 남은 연출 1800 → 받은 뒤 1800ms에 시작
    const feed = reduceFeed(null, { type: "snapshot", snapshot: { matchId: "m1", engineVersion: 1, config, actions: [], stateHash: "h", turn: turn(0, 0, 1, 23800), slots: [] }, now: 5000 }) as MatchFeed;
    expect(feed.startAt).toBe(6800);
    // 연출이 끝난 뒤의 첫 턴(remainingMs ≤ turnMs)은 받은 즉시
    const later = reduceFeed(null, { type: "snapshot", snapshot: { matchId: "m1", engineVersion: 1, config, actions: [], stateHash: "h", turn: turn(0, 0, 1, 15000), slots: [] }, now: 5000 }) as MatchFeed;
    expect(later.startAt).toBe(5000);
    // 다음 턴부터는 마감에 연출 시간이 섞일 수 있어 쓰지 않는다
    const next = reduceFeed(null, { type: "snapshot", snapshot: { matchId: "m1", engineVersion: 1, config, actions: [fire], stateHash: "h", turn: turn(1, 1, 2, 25000), slots: [] }, now: 5000 }) as MatchFeed;
    expect(next.startAt).toBe(5000);
  });

  it("같은 경기의 늦게 온(더 짧은) 스냅샷은 버린다", () => {
    let feed = start();
    feed = reduceFeed(feed, { type: "resolved", payload: resolved(0), now: 2000 }) as MatchFeed;
    feed = reduceFeed(feed, { type: "resolved", payload: resolved(1), now: 3000 }) as MatchFeed;
    const late = reduceFeed(feed, { type: "snapshot", snapshot: { matchId: "m1", engineVersion: 1, config, actions: [fire], stateHash: "h0", turn: turn(1), slots: [] }, now: 4000 });
    expect(late).toBe(feed);
  });

  it("남은 시간 — 받은 시각부터 센다", () => {
    const feed = start();
    expect(remainingMs(feed, 1000)).toBe(25000);
    expect(remainingMs(feed, 11000)).toBe(15000);
    expect(remainingMs(feed, 99000)).toBe(0);
  });
});

describe("TURN_MISMATCH 뒤 판단(D-015)", () => {
  const sent = turn(4, 0, 5);
  it("같은 사람·같은 턴인데 seq만 늘었다(남의 기권) → 같은 입력으로 다시", () => {
    expect(mismatchDecision(sent, { ...sent, seq: 5 })).toBe("retry");
  });
  it("턴 주인·턴 번호가 바뀌었다 → 입력을 버린다", () => {
    expect(mismatchDecision(sent, turn(5, 1, 6))).toBe("drop");
    expect(mismatchDecision(sent, { ...sent, turnNo: 6, seq: 5 })).toBe("drop");
    expect(mismatchDecision(sent, null)).toBe("drop");
  });
  it("아직 새 소식이 없다 → 기다린다(그래도 없으면 resync)", () => {
    expect(mismatchDecision(sent, sent)).toBe("wait");
  });
});
