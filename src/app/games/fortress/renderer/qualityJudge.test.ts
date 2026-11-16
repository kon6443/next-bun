import { describe, expect, it } from "vitest";
import { createQualityJudge } from "./qualityJudge";

const push = (j: ReturnType<typeof createQualityJudge>, n: number, f: Partial<Parameters<ReturnType<typeof createQualityJudge>["push"]>[0]>) => {
  for (let i = 0; i < n; i++) j.push({ drawMs: 1, gapMs: 16, hidden: false, glowOn: false, ...f });
};

describe("createQualityJudge — 전장 품질 자동 하향", () => {
  it("가벼운 그리기·고른 프레임이면 high 유지", () => {
    const j = createQualityJudge();
    push(j, 500, {});
    expect(j.quality).toBe("high");
  });

  it("그리기 시간 지수 평균이 길게 이어지면 low(프레임 간격은 고르더라도)", () => {
    const j = createQualityJudge();
    push(j, 400, { drawMs: 20 });
    expect(j.quality).toBe("low");
  });

  it("프레임이 들쭉날쭉 밀리면 glow가 켜져 있을 땐 glowSlow부터, 꺼져 있으면 low", () => {
    const jitter = (i: number) => (i % 2 ? 20 : 60);
    const withGlow = createQualityJudge();
    for (let i = 0; i < 200; i++) withGlow.push({ drawMs: 1, gapMs: jitter(i), hidden: false, glowOn: true });
    expect(withGlow.glowSlow).toBe(true);
    expect(withGlow.quality).toBe("high");
    // glow가 꺼지면 알림도 내린다
    withGlow.push({ drawMs: 1, gapMs: 16, hidden: false, glowOn: false });
    expect(withGlow.glowSlow).toBe(false);

    const noGlow = createQualityJudge();
    for (let i = 0; i < 200; i++) noGlow.push({ drawMs: 1, gapMs: jitter(i), hidden: false, glowOn: false });
    expect(noGlow.quality).toBe("low");
  });

  it("탭이 숨었거나 첫 프레임(간격 없음)은 프레임 간격을 세지 않는다", () => {
    const j = createQualityJudge();
    for (let i = 0; i < 200; i++) j.push({ drawMs: 1, gapMs: i % 2 ? 20 : 60, hidden: true, glowOn: false });
    for (let i = 0; i < 200; i++) j.push({ drawMs: 1, gapMs: null, hidden: false, glowOn: false });
    expect(j.quality).toBe("high");
  });
});
