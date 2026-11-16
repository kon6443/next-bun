import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_LOOK, lookFromUrl, toLook } from "./look";

describe("toLook — 경기 화면 그림 (D-027 보충 1: classic 폐기, vivid 하나 + glow)", () => {
  it("쿼리가 없거나 모르는 값(빠진 stage·예전 classic 포함)이면 기본 vivid, glow는 그대로", () => {
    expect(DEFAULT_LOOK).toBe("vivid");
    expect(toLook(null)).toBe("vivid");
    expect(toLook(undefined)).toBe("vivid");
    expect(toLook("stage")).toBe("vivid");
    expect(toLook("classic")).toBe("vivid");
    expect(toLook("glow")).toBe("glow");
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
    globalThis.window = fakeWindow("?look=glow", new Map());
    expect(lookFromUrl()).toBe("glow");
    globalThis.window = fakeWindow("?look=classic", new Map());
    expect(lookFromUrl()).toBe("vivid");
    globalThis.window = fakeWindow("?seed=3", new Map());
    expect(lookFromUrl()).toBe("vivid");
  });

  it("고른 ?look은 그 탭에 기억해 쿼리 없는 페이지로 옮겨도 이어진다", () => {
    const store = new Map<string, string>();
    globalThis.window = fakeWindow("?look=glow", store);
    expect(lookFromUrl()).toBe("glow");
    globalThis.window = fakeWindow("", store);
    expect(lookFromUrl()).toBe("glow");
    globalThis.window = fakeWindow("?look=vivid", store);
    expect(lookFromUrl()).toBe("vivid");
    globalThis.window = fakeWindow("", store);
    expect(lookFromUrl()).toBe("vivid");
  });

  it("저장소를 못 쓰면 쿼리만 본다", () => {
    globalThis.window = fakeWindow("?look=glow", null);
    expect(lookFromUrl()).toBe("glow");
    globalThis.window = fakeWindow("", null);
    expect(lookFromUrl()).toBe("vivid");
  });
});
