import { describe, expect, it } from "vitest";
import { hash01 } from "./noise";

describe("hash01", () => {
  it("예전 네 렌더러의 식과 같은 값 — 배경·탱크 무늬 자리가 바뀌지 않는다", () => {
    const old = (i: number) => {
      const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
      return s - Math.floor(s);
    };
    for (const i of [0, 1, 7, 41, 100, 1400, 3.1, -5]) expect(hash01(i)).toBe(old(i));
  });

  it("0 이상 1 미만, 같은 입력은 같은 값", () => {
    for (let i = 0; i < 500; i++) {
      const v = hash01(i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(hash01(i)).toBe(v);
    }
  });
});
