import { describe, expect, it } from "vitest";
import { WEAPONS } from "../engine";
import { popupHeight, popupLabelBelow, popupTier, stackPopupYs, weaponFx } from "./vivid";

describe("weaponFx — 시안의 무기별 연출", () => {
  it("엔진 무기마다 서로 다른 연출이 있다(id 순서 = WEAPONS)", () => {
    const kinds = WEAPONS.map((w) => weaponFx(w.id).kind);
    expect(kinds).toEqual(["shell", "triple", "heavy", "split", "mega", "strike"]);
    expect(new Set(WEAPONS.map((w) => weaponFx(w.id).body)).size).toBe(WEAPONS.length);
  });

  it("무기를 모르면(없음·범위 밖) 포탄 모양", () => {
    expect(weaponFx(undefined).kind).toBe("shell");
    expect(weaponFx(99).kind).toBe("shell");
    expect(weaponFx(-1).kind).toBe("shell");
  });
});

describe("popupTier — 피해 숫자 단계 (D-025 보충 6)", () => {
  it("20 미만 · 20~29 · 30~44(강타) · 45 이상(치명타, 별빛) — 클수록 크다", () => {
    expect(popupTier(10)).toMatchObject({ size: 22, label: null, burst: false });
    expect(popupTier(20)).toMatchObject({ size: 28, label: null });
    expect(popupTier(30)).toMatchObject({ size: 34, label: "강타!", burst: false });
    expect(popupTier(50)).toMatchObject({ size: 40, label: "치명타!", burst: true });
  });
});

describe("stackPopupYs — 같은 탱크에 겹친 피해 숫자", () => {
  it("먼저 뜬 숫자가 위, 숫자·문구(치명타!)가 서로 겹치지 않는다 — 떠오른 정도가 달라도", () => {
    const list = [
      { slot: 0, amount: 17, progress: 0.3 },
      { slot: 0, amount: 48, progress: 0.05 },
    ];
    const ys = stackPopupYs(list, 300);
    expect(ys[0]).toBeLessThan(ys[1]);
    // 아래(-48) 숫자의 윗선보다 위 숫자(-17) 기준선이 위
    expect(ys[0]).toBeLessThanOrEqual(ys[1] - popupHeight(list[1]));
  });

  it("문구(치명타!)는 자기 숫자 바로 아래 부제 — 위 숫자의 부제가 아래 숫자에 닿지 않는다", () => {
    const list = [
      { slot: 0, amount: 48, progress: 0.3 },
      { slot: 0, amount: 17, progress: 0.05 },
    ];
    const ys = stackPopupYs(list, 300);
    // 위(-48) 숫자의 부제 아래 끝이 아래(-17) 숫자의 윗선보다 위
    expect(ys[0] + popupLabelBelow(list[0])).toBeLessThan(ys[1] - popupHeight(list[1]));
  });
});
