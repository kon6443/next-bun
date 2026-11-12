import { describe, expect, it } from "vitest";
import { drawWindLeaves, sideWall } from "./vividWorld";

describe("sideWall — 시안 지형의 벽 외곽선 범위", () => {
  it("옆 열이 통째로 흙이면 옆 윗면부터 이 열 윗면까지(절벽·구덩이 벽)", () => {
    expect(sideWall([490, 1024], 600)).toEqual([490, 600]);
  });

  it("옆 열이 밑이 빈 얇은 지표면 그 지표 두께까지만 — 구덩이 안 허공에 세로선을 긋지 않는다", () => {
    // 구덩이 원이 지표 바로 밑을 지나간 가장자리 열: 490~494 흙, 494~620 빈칸, 620~ 흙
    expect(sideWall([490, 494, 620, 1024], 600)).toEqual([490, 494]);
  });

  it("겹침이 2px 이하이거나 옆 열이 없으면(맵 끝) 긋지 않는다", () => {
    expect(sideWall([598, 1024], 600)).toBeNull();
    expect(sideWall([490, 491, 620, 1024], 600)).toBeNull();
    expect(sideWall(undefined, 600)).toBeNull();
    expect(sideWall([], 600)).toBeNull();
  });
});

describe("drawWindLeaves — 화면 속 바람 (D-025 보충 6)", () => {
  /** 잎·먼지 하나마다 fill이 한 번 — 호출 수로 개수를 센다 */
  const count = (wind: number, opts: { quality?: "high" | "low"; reduced?: boolean; map?: "hills" | "canyon" } = {}) => {
    let fills = 0;
    const ctx = new Proxy(
      {},
      {
        get: (_t, key) => (key === "fill" ? () => fills++ : () => {}),
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D;
    drawWindLeaves(ctx, { width: 390, height: 600 }, wind, 1234, opts.map ?? "hills", opts.quality ?? "high", opts.reduced ?? false);
    return fills;
  };

  it("바람이 셀수록 많고, 품질 low면 줄고, 움직임 줄이기면 그리지 않는다", () => {
    expect(count(8)).toBeGreaterThan(count(1));
    expect(count(8, { quality: "low" })).toBeLessThan(count(8));
    expect(count(8, { reduced: true })).toBe(0);
    expect(count(0)).toBeGreaterThan(0);
    expect(count(5, { map: "canyon" })).toBeGreaterThan(0);
  });
});
