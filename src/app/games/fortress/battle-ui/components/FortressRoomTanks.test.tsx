// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { RoomPlayer, RoomState } from "@/types/fortressSocket";
import { NO_TEAM_COLOR, FortressRoomTanks, roomTankColor, skinText } from "./FortressRoomTanks";
import { SLOT_COLORS, TEAM_COLORS } from "../../renderer/drawScene";

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const player = (name: string, skin: { id: string; level: number }, team: 0 | 1 | null = null): RoomPlayer => ({
  playerId: name,
  name,
  ready: true,
  connected: true,
  isGuest: false,
  extra: { team, tankId: 0, skin },
});
const room = (players: RoomPlayer[]): RoomState =>
  ({ code: "ABCD", name: "방", locked: false, hostId: players[0]?.playerId ?? "", status: "WAITING", mode: "ffa", mapId: "hills", maxPlayers: 4, players }) as RoomState;

describe("대기실 탱크 줄 (D-025)", () => {
  it("방 플레이어의 장착 스킨을 그림으로 — 이름·스킨이 그림 설명에 담긴다(모르는 id는 기본)", () => {
    render(<FortressRoomTanks room={room([player("가나", { id: "neon", level: 3 }), player("다라", { id: "default", level: 1 }), player("마바", { id: "gold", level: 9 })])} />);
    expect(screen.getByRole("img")).toHaveAccessibleName("방 탱크 미리보기: 가나 네온 라인 Lv3, 다라 기본, 마바 기본");
  });

  it("스킨 바꾸기는 새 탭으로(이 탭은 방에 남는다) — 다시 들어오면 적용 안내", () => {
    render(<FortressRoomTanks room={room([player("가나", { id: "desert", level: 2 })])} />);
    const link = screen.getByRole("link", { name: /스킨 바꾸기/ });
    expect(link).toHaveAttribute("href", "/games/fortress/skins");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByText("바꾼 스킨은 방에 다시 들어오면 적용돼요.")).toBeInTheDocument();
  });

  // 리뷰 의심(D-025 A): 팀전에서 팀을 안 고른 자리가 입장 순 0·1이면 파랑·주황 팀색처럼 보였다
  it("roomTankColor — 개인전은 입장 순 자리색, 팀전은 팀색, 팀 없음은 중립색", () => {
    expect([0, 1, 2, 3, 4].map((i) => roomTankColor("ffa", null, i))).toEqual([...SLOT_COLORS, SLOT_COLORS[0]]);
    expect(roomTankColor("team", 1, 0)).toBe(TEAM_COLORS[1]);
    expect(roomTankColor("team", 0, 3)).toBe(TEAM_COLORS[0]);
    expect(roomTankColor("team", null, 0)).toBe(NO_TEAM_COLOR);
    expect(TEAM_COLORS).not.toContain(NO_TEAM_COLOR);
  });

  it("skinText — 기본은 '기본', 아니면 이름과 레벨", () => {
    expect(skinText({ id: "arctic", level: 4 })).toBe("눈보라 Lv4");
    expect(skinText(undefined)).toBe("기본");
  });
});
