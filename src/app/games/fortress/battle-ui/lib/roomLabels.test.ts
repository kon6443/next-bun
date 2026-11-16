import { describe, expect, it } from "vitest";
import { FORTRESS_LOBBY_PATH, fortressRoomPath, settingsSummary } from "./roomLabels";

describe("roomLabels", () => {
  it("settingsSummary — 모드 · 맵", () => {
    expect(settingsSummary({ mode: "ffa", mapId: "hills" })).toBe("개인전 · 언덕");
    expect(settingsSummary({ mode: "team", mapId: "random" })).toBe("팀전 2:2 · 무작위");
  });

  it("fortressRoomPath — 잠긴 방만 ?locked=1", () => {
    expect(fortressRoomPath("ABC123")).toBe(`${FORTRESS_LOBBY_PATH}/ABC123`);
    expect(fortressRoomPath("ABC123", true)).toBe("/games/fortress/battle/ABC123?locked=1");
  });
});
