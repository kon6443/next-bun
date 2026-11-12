// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TANKS, WEAPONS } from "../engine";
import { fortressPadLayout } from "./fortressPad";
import { WeaponIcon } from "./WeaponIcon";

afterEach(cleanup);

describe("무기 아이콘·무기 버튼 (D-025 보충 6)", () => {
  it("무기 6종이 서로 다른 아이콘(장식이라 낭독하지 않음)", () => {
    const kinds = WEAPONS.map((w) => {
      const { container } = render(<WeaponIcon weaponId={w.id} />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      const kind = svg.getAttribute("data-weapon-icon");
      cleanup();
      return kind;
    });
    expect(new Set(kinds).size).toBe(WEAPONS.length);
  });

  const cannon = { tankId: 0, cooldown: 0 };
  const special = TANKS[0].weapons[2];
  const content = (layout: ReturnType<typeof fortressPadLayout>, id: string) => render(<>{layout.buttons.find((b) => b.id === id)!.content}</>).container;

  it("패드 무기 버튼: 시안은 아이콘, classic은 글자만", () => {
    const vivid = content(fortressPadLayout({ tank: cannon, weaponId: 0, power: 60, charge: null, facing: 1, fireAria: "", vivid: true }), "weapon");
    expect(vivid.querySelector("[data-weapon-icon]")).not.toBeNull();
    cleanup();
    const classic = content(fortressPadLayout({ tank: cannon, weaponId: 0, power: 60, charge: null, facing: 1, fireAria: "" }), "weapon");
    expect(classic.querySelector("[data-weapon-icon]")).toBeNull();
  });

  it("필살기를 고르면(시안) 무기·발사 버튼에 빛나는 테두리 표시, 일반 무기는 없음", () => {
    const layout = fortressPadLayout({ tank: cannon, weaponId: special, power: 60, charge: null, facing: 1, fireAria: "", vivid: true });
    expect(content(layout, "weapon").querySelector('[data-special-glow="true"]')).not.toBeNull();
    cleanup();
    expect(content(layout, "fire").querySelector('[data-special-glow="true"]')).not.toBeNull();
    cleanup();
    const normal = fortressPadLayout({ tank: cannon, weaponId: 0, power: 60, charge: null, facing: 1, fireAria: "", vivid: true });
    expect(content(normal, "weapon").querySelector('[data-special-glow="true"]')).toBeNull();
  });

  it("필살기가 대기 중이면 남은 턴 배지", () => {
    const layout = fortressPadLayout({ tank: { tankId: 0, cooldown: 3 }, weaponId: 0, power: 60, charge: null, facing: 1, fireAria: "", vivid: true });
    expect(content(layout, "weapon").textContent).toContain("3");
  });
});
