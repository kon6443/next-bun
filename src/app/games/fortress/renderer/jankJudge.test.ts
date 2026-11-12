import { describe, expect, it } from "vitest";
import { JANK_WINDOW, createJankJudge } from "./jankJudge";

const feed = (intervals: (i: number) => number, count = JANK_WINDOW * 2) => {
  const j = createJankJudge();
  let dropped = false;
  for (let i = 0; i < count; i++) dropped = j.push(intervals(i)) || dropped;
  return dropped;
};

describe("createJankJudge — 프레임 간격 기반 느린 기기 판정", () => {
  it("들쭉날쭉하게 25ms를 넘는 프레임이 절반 이상이면 느린 기기", () => {
    expect(feed((i) => (i % 3 === 0 ? 20 : i % 3 === 1 ? 34 : 48))).toBe(true);
  });

  it("30Hz로 고르게 묶인 기기(약 33ms 일정)는 느린 기기로 보지 않는다", () => {
    expect(feed((i) => 33.3 + (i % 2 ? 0.4 : -0.4))).toBe(false);
  });

  it("고르게 느려도 25fps 아래(평균 40ms 초과)면 느린 기기", () => {
    expect(feed(() => 50)).toBe(true);
  });

  it("30Hz 고정 기기에서 창마다 몇 프레임(GC 등)만 밀려도 느린 기기로 보지 않는다", () => {
    expect(feed((i) => (i % 40 === 0 ? 66.7 : 33.3))).toBe(false);
  });

  it("60fps에 가끔 끊기는 정도는 그대로 둔다", () => {
    expect(feed((i) => (i % 10 === 0 ? 40 : 16.7))).toBe(false);
  });

  it("창이 차기 전·긴 공백(탭 숨김)은 판정하지 않는다", () => {
    expect(feed(() => 45, JANK_WINDOW - 1)).toBe(false);
    expect(feed(() => 1000)).toBe(false);
  });
});
