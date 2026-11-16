import { describe, expect, it, vi } from "vitest";
import type { RoomPlayer, RoomState } from "@/types/fortressSocket";

// 방 단계 컴포넌트가 끌어오는 소켓·경기 화면은 이 순수 함수와 무관 — 가볍게 막는다
vi.mock("../contexts/FortressSocketContext", () => ({ useFortressSocket: () => ({}) }));
vi.mock("./FortressOnlineStage", () => ({ FortressOnlineStage: () => null }));

const { fortressCanStart } = await import("./FortressRoomStage");

const player = (id: string, team: 0 | 1 | null, over: Partial<RoomPlayer> = {}): RoomPlayer => ({
  playerId: id,
  name: id,
  ready: true,
  connected: true,
  isGuest: true,
  extra: { team, tankId: 0, skin: { id: "default", level: 1 } },
  ...over,
});
const room = (mode: "ffa" | "team", players: RoomPlayer[]): RoomState =>
  ({ code: "ABC123", name: "방", locked: false, hostId: "a", status: "WAITING", mode, mapId: "hills", maxPlayers: 4, players }) as RoomState;

describe("fortressCanStart — 서버 시작 조건과 같게", () => {
  it("개인전: 2명 이상·전원 연결·방장 외 준비면 시작", () => {
    expect(fortressCanStart(room("ffa", [player("a", null, { ready: false }), player("b", null)]))).toBe(true);
    expect(fortressCanStart(room("ffa", [player("a", null)]))).toBe(false);
    expect(fortressCanStart(room("ffa", [player("a", null), player("b", null, { ready: false })]))).toBe(false);
    expect(fortressCanStart(room("ffa", [player("a", null), player("b", null, { connected: false })]))).toBe(false);
  });

  it("팀전: 정확히 2:2일 때만", () => {
    expect(fortressCanStart(room("team", [player("a", 0), player("b", 0), player("c", 1), player("d", 1)]))).toBe(true);
    expect(fortressCanStart(room("team", [player("a", 0), player("b", 0), player("c", 0), player("d", 1)]))).toBe(false);
    expect(fortressCanStart(room("team", [player("a", 0), player("b", 1)]))).toBe(false);
    expect(fortressCanStart(room("team", [player("a", 0), player("b", 0), player("c", 1), player("d", null)]))).toBe(false);
  });
});
