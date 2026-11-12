import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_LOOK, lookFromUrl, toLook, usesVivid } from "./look";

describe("toLook — 경기 화면 그림 (보충 5: vivid 기본)", () => {
  it("쿼리가 없거나 모르는 값(빠진 stage 포함)이면 기본 vivid, classic·glow는 그대로", () => {
    expect(DEFAULT_LOOK).toBe("vivid");
    expect(toLook(null)).toBe("vivid");
    expect(toLook(undefined)).toBe("vivid");
    expect(toLook("stage")).toBe("vivid");
    expect(toLook("classic")).toBe("classic");
    expect(toLook("glow")).toBe("glow");
    expect(usesVivid(toLook(null))).toBe(true);
    expect(usesVivid(toLook("classic"))).toBe(false);
  });
});

describe("lookFromUrl", () => {
  const original = globalThis.window;
  afterEach(() => {
    globalThis.window = original;
  });

  it("창이 없으면(서버) 기본값", () => {
    // @ts-expect-error 서버 흉내
    delete globalThis.window;
    expect(lookFromUrl()).toBe("vivid");
  });

  const fakeWindow = (search: string, store: Map<string, string> | null) =>
    ({
      location: { search },
      sessionStorage: store
        ? { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
        : {
            getItem: () => {
              throw new Error("blocked");
            },
            setItem: () => {
              throw new Error("blocked");
            },
          },
    }) as unknown as Window & typeof globalThis;

  it("주소의 ?look을 따르고, 쿼리가 없으면 기본 vivid", () => {
    globalThis.window = fakeWindow("?look=classic", new Map());
    expect(lookFromUrl()).toBe("classic");
    globalThis.window = fakeWindow("?seed=3", new Map());
    expect(lookFromUrl()).toBe("vivid");
  });

  it("고른 ?look은 그 탭에 기억해 쿼리 없는 페이지로 옮겨도 이어진다(되돌리기 classic 유지)", () => {
    const store = new Map<string, string>();
    globalThis.window = fakeWindow("?look=classic", store);
    expect(lookFromUrl()).toBe("classic");
    globalThis.window = fakeWindow("", store);
    expect(lookFromUrl()).toBe("classic");
    globalThis.window = fakeWindow("?look=vivid", store);
    expect(lookFromUrl()).toBe("vivid");
    globalThis.window = fakeWindow("", store);
    expect(lookFromUrl()).toBe("vivid");
  });

  it("저장소를 못 쓰면 쿼리만 본다", () => {
    globalThis.window = fakeWindow("?look=classic", null);
    expect(lookFromUrl()).toBe("classic");
    globalThis.window = fakeWindow("", null);
    expect(lookFromUrl()).toBe("vivid");
  });
});
