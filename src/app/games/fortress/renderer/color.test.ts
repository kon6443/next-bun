import { describe, expect, it } from "vitest";
import { hexToRgb, mixRgb, rgbaOf } from "./color";

describe("renderer color", () => {
  it("hexToRgb", () => {
    expect(hexToRgb("#38bdf8")).toEqual([0x38, 0xbd, 0xf8]);
    expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
  });

  it("rgbaOf — 예전 tankArt colorAlpha와 같은 문자열", () => {
    expect(rgbaOf("#f97316", 0.55)).toBe("rgba(249, 115, 22, 0.55)");
  });

  it("mixRgb 끝점 — t 0은 원래 색, 1은 목표 색", () => {
    expect(mixRgb("#38bdf8", [20, 10, 30], 0)).toBe("rgb(56, 189, 248)");
    expect(mixRgb("#38bdf8", [20, 10, 30], 1)).toBe("rgb(20, 10, 30)");
  });

  it("예전 탱크 음영(v + (t - v)·k)·밝게(×0.35) 식과 실제 쓰는 상수에서 모든 채널 값이 같다", () => {
    const old = (v: number, t: number, k: number) => Math.round(v + (t - v) * k);
    const pairs: [[number, number, number], number][] = [
      [[0, 0, 0], 0.08],
      [[255, 255, 255], 0.28],
      [[255, 250, 235], 0.55],
      [[20, 10, 30], 0.38],
      [[20, 10, 30], 0.62],
      [[255, 255, 255], 0.35],
    ];
    for (const [to, k] of pairs) {
      for (let v = 0; v < 256; v++) {
        const hex = `#${[v, v, v].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
        expect(mixRgb(hex, to, k)).toBe(`rgb(${old(v, to[0], k)}, ${old(v, to[1], k)}, ${old(v, to[2], k)})`);
      }
    }
  });
});
