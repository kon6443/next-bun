import { describe, expect, it } from "vitest";
import { DEFAULT_TANK_SKIN, TANK_SKIN_IDS, TANK_SKIN_LABELS, toTankSkin } from "./tankSkins";

describe("탱크 스킨 값 정리(toTankSkin)", () => {
  it("모르는 id·빈 값은 기본·Lv1로 그린다(계약 FortressTankSkin)", () => {
    expect(toTankSkin(null)).toEqual(DEFAULT_TANK_SKIN);
    expect(toTankSkin(undefined)).toEqual(DEFAULT_TANK_SKIN);
    expect(toTankSkin({ id: "gold", level: 3 })).toEqual(DEFAULT_TANK_SKIN);
    expect(toTankSkin({ id: 7, level: 3 })).toEqual(DEFAULT_TANK_SKIN);
  });
  it("레벨은 1~5 정수로 자르고, 숫자가 아니면 1", () => {
    expect(toTankSkin({ id: "neon", level: 9 })).toEqual({ id: "neon", level: 5 });
    expect(toTankSkin({ id: "neon", level: 0 })).toEqual({ id: "neon", level: 1 });
    expect(toTankSkin({ id: "desert", level: 2.7 })).toEqual({ id: "desert", level: 2 });
    expect(toTankSkin({ id: "arctic", level: "3" })).toEqual({ id: "arctic", level: 1 });
  });
  it("카탈로그 4종 모두 이름이 있다", () => {
    expect(TANK_SKIN_IDS).toEqual(["default", "desert", "arctic", "neon"]);
    for (const id of TANK_SKIN_IDS) expect(TANK_SKIN_LABELS[id]).toBeTruthy();
  });
});
