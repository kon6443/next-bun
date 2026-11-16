// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { markGuideSeen, readGuideSeen } from "./FortressGuide";

describe("조작 안내 1회 기억", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("처음엔 안 봄, 표시하면 봄", () => {
    expect(readGuideSeen()).toBe(false);
    markGuideSeen();
    expect(readGuideSeen()).toBe(true);
    expect(window.localStorage.getItem("fortress:guide:v1")).toBe("1");
  });

  it("저장소가 막혀도 던지지 않는다 — 읽기는 안 봄으로", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => markGuideSeen()).not.toThrow();
    expect(readGuideSeen()).toBe(false);
  });
});
