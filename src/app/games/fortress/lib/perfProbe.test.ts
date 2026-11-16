// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearPerf, recordFrame, recordThink, snapshot, trimPerf } from "./perfProbe";

describe("perfProbe", () => {
  beforeEach(() => clearPerf());

  it("빈 표본은 0", () => {
    expect(snapshot()).toEqual({ frames: 0, frameAvg: 0, frameP95: 0, frameMax: 0, drawAvg: 0, drawMax: 0, think: {} });
  });

  it("프레임 평균·p95·최대, 그리기 평균·최대, AI 레벨별 시간", () => {
    for (let i = 1; i <= 20; i++) recordFrame(i, i / 10);
    recordThink(2, 12.345);
    const s = snapshot();
    expect(s.frames).toBe(20);
    expect(s.frameAvg).toBe(10.5);
    expect(s.frameP95).toBe(20);
    expect(s.frameMax).toBe(20);
    expect(s.drawAvg).toBe(1.05);
    expect(s.drawMax).toBe(2);
    expect(s.think).toEqual({ level2: [12.35] });
  });

  it("trimPerf는 오래된 표본만 버리고(최근 2000개), window.__fortressPerf에 싣는다", () => {
    for (let i = 0; i < 2100; i++) recordFrame(i, 0);
    trimPerf();
    expect(snapshot().frames).toBe(2000);
    expect(snapshot().frameMax).toBe(2099);
    expect((window as unknown as { __fortressPerf: { frames: number } }).__fortressPerf.frames).toBe(2000);
  });
});
