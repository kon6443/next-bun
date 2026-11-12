import { describe, expect, it } from "vitest";
import { fortressPadLayout, nextWeapon, usableWeapons } from "./fortressPad";

// 캐논: 포탄(0)·대형탄(2)·메가탄(4, 필살기)
const cannon = (cooldown: number) => ({ tankId: 0, cooldown });

describe("포트리스 터치 패드 — 무기 바꾸기 (D-025 보충 2)", () => {
  it("usableWeapons — 필살기는 대기 중이면 빠진다", () => {
    expect(usableWeapons(cannon(0))).toEqual([0, 2, 4]);
    expect(usableWeapons(cannon(2))).toEqual([0, 2]);
  });

  it("nextWeapon — 차례로 돌고 끝이면 처음으로, 대기 중 필살기는 건너뛴다, 못 쓰게 된 무기면 첫 무기", () => {
    expect([0, 2, 4].map((w) => nextWeapon(cannon(0), w))).toEqual([2, 4, 0]);
    expect(nextWeapon(cannon(3), 2)).toBe(0);
    expect(nextWeapon(cannon(3), 4)).toBe(0);
  });

  it("배치 — 무기 버튼 접근 이름에 지금 무기와 필살기 대기 턴, 고를 무기가 둘 이상이면 쓸 수 있다", () => {
    const layout = fortressPadLayout({ tank: cannon(2), weaponId: 2, power: 60, charge: null, facing: 1, fireAria: "발사 60" });
    const weapon = layout.buttons.find((b) => b.id === "weapon")!;
    expect(weapon.aria).toBe("무기 바꾸기 — 지금 대형탄, 메가탄 2턴 뒤");
    expect(weapon.disabled).toBe(false);
    expect(layout.dpad.left?.aria).toBe("왼쪽으로 돌아서기");
    expect(layout.dpad.right?.aria).toBe("오른쪽으로 이동");
    // 누르는 동안 코드는 배치 안에서 하나씩(공용 GamePad 불변 조건)
    const presses = [...Object.values(layout.dpad), ...layout.buttons].map((x) => (x!.action.kind === "hold" ? x!.action.press : null)).filter((x) => x !== null);
    expect(new Set(presses).size).toBe(presses.length);
  });
});
