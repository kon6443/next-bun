// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null, status: "unauthenticated" }) }));
vi.mock("@/app/auth/useKakaoLogin", () => ({ useKakaoLogin: () => ({ start: vi.fn(), isStarting: false }) }));
vi.mock("@/app/games/_shared/hooks/useKakaoReady", () => ({ useKakaoReady: () => ({ kakao: "off", kakaoScript: null }) }));
// 경기 화면(캔버스)은 이 검사와 무관 — 자리만
vi.mock("../../components/FortressMatch", () => ({ FortressMatch: () => <div data-testid="fortress-match" /> }));
const published = vi.hoisted(() => ({ calls: [] as (string | null)[] }));
vi.mock("../hooks/useFortressMatchPublished", () => ({
  useFortressMatchPublished: (matchId: string | null) => {
    published.calls.push(matchId);
    return { status: "waiting" };
  },
}));
const socket = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("../contexts/FortressSocketContext", () => ({ useFortressSocket: () => socket.value }));

import { ENGINE_VERSION } from "../../engine";
import type { RoomState } from "@/types/fortressSocket";
import type { MatchFeed } from "../lib/matchFeed";
import { FortressOnlineStage } from "./FortressOnlineStage";

const config = { seed: 7, mapId: "hills" as const, mode: "ffa" as const, players: [{ slot: 0, team: 0, tankId: 0 }, { slot: 1, team: 0, tankId: 1 }] };
const feed: MatchFeed = {
  matchId: "kYDnp6WGrJZAlFGf",
  engineVersion: ENGINE_VERSION,
  config,
  slots: [
    { slot: 0, playerId: "a", name: "가나", skin: { id: "default", level: 1 } },
    { slot: 1, playerId: "b", name: "다라", skin: { id: "default", level: 1 } },
  ],
  actions: [],
  hashes: [],
  // 끝났다는 소식(next=null·matchEnded)을 못 받아 턴이 남아 있다
  turn: { seq: 0, turnNo: 1, slot: 0, deadlineAt: "", turnMs: 22000, remainingMs: 22000 },
  turnAt: 0,
  startAt: 0,
  ended: null,
  epoch: 1,
  needsResync: false,
};
const room = { code: "ABC123", name: "한판", locked: false, hostId: "a", status: "RESULT", players: [] } as unknown as RoomState;

beforeEach(() => {
  vi.useFakeTimers();
  published.calls = [];
  socket.value = { feed, myPlayerId: "a", submitTurn: vi.fn(), resync: vi.fn(), rematch: vi.fn() };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("끊긴 사이 끝난 경기(고아 피드)", () => {
  it("방은 끝났는데 경기 소식이 끊긴 채면 잠시 뒤 결과 화면으로 — 저장된 경기 조회(published)를 시작한다", async () => {
    render(<FortressOnlineStage room={room} connection="connected" onReconnect={() => {}} onExit={() => {}} onCopyInvite={() => {}} />);
    expect(screen.getByTestId("fortress-match")).toBeTruthy();
    expect(published.calls.at(-1)).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    expect(screen.getByTestId("fortress-online-result")).toBeTruthy();
    expect(published.calls.at(-1)).toBe(feed.matchId);
    expect(screen.getByTestId("fortress-replay-online")).toBeTruthy();
  });
});
