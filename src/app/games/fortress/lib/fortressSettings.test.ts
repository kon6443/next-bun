// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const vib = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("@/app/games/_shared/lib/vibrate", () => ({ vibrate: (p: unknown) => vib.calls.push(p) }));

import { FORTRESS_SETTINGS_KEY, __resetFortressSettingsForTests, fortressVibrate, getFortressSettings, saveFortressSettings } from "./fortressSettings";

const setReduced = (on: boolean) => {
  window.matchMedia = ((q: string) => ({ matches: on && q.includes("reduce"), media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
};

beforeEach(() => {
  window.localStorage.clear();
  __resetFortressSettingsForTests();
  vib.calls = [];
  setReduced(false);
});
afterEach(() => __resetFortressSettingsForTests());

describe("포트리스 설정 — 진동 (D-025 보충 6)", () => {
  it("기본은 진동 켜짐(테트리스와 같다), 깨진 저장값도 기본", () => {
    expect(getFortressSettings().vibration).toBe(true);
    window.localStorage.setItem(FORTRESS_SETTINGS_KEY, "{oops");
    __resetFortressSettingsForTests();
    expect(getFortressSettings().vibration).toBe(true);
  });

  it("켜져 있으면 진동, 끄면 진동하지 않고 저장된다", () => {
    expect(fortressVibrate(30)).toBe(true);
    saveFortressSettings({ vibration: false });
    expect(fortressVibrate(30)).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(FORTRESS_SETTINGS_KEY) ?? "{}")).toEqual({ vibration: false });
    expect(vib.calls).toEqual([30]);
  });

  it("움직임 줄이기면 설정이 켜져 있어도 진동하지 않는다", () => {
    setReduced(true);
    expect(fortressVibrate([60, 40, 90])).toBe(false);
    expect(vib.calls).toEqual([]);
  });
});
