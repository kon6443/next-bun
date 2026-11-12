import { describe, expect, it } from "vitest";
import { type Terrain, WORLD_HEIGHT, WORLD_WIDTH } from "../engine";
import { type TerrainLayer, paintAll } from "./terrainLayer";
import { worldTheme } from "./vividWorld";

/** 칠하기는 대역 ctx(아무것도 하지 않음) — origTop(파인 면 기준)만 본다 */
function fakeLayer(): TerrainLayer {
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true }) as unknown as CanvasRenderingContext2D;
  return { canvas: {} as HTMLCanvasElement, ctx, dirt: "#000", depth: "#000" as unknown as CanvasGradient, world: { theme: worldTheme("hills"), ground: "#000", deep: "#000" as unknown as CanvasGradient, origTop: null } };
}
const flat = (top: number): Terrain => ({ cols: Array.from({ length: WORLD_WIDTH }, () => [top, WORLD_HEIGHT]) });

describe("paintAll — 시안 지형의 '원래 지표면' 기준(origTop)", () => {
  it("origin(경기 시작 지형)을 주면 그 지표면이 기준 — 중간에 들어온 온라인 경기도 파인 면을 파인 면으로", () => {
    const layer = fakeLayer();
    paintAll(layer, flat(700), flat(600));
    expect(layer.world?.origTop?.[100]).toBe(600);
  });

  it("origin이 없으면 처음 칠한 지형이 기준이고, 다시 칠해도(리플레이 턴 이동) 기준은 그대로", () => {
    const layer = fakeLayer();
    paintAll(layer, flat(600));
    paintAll(layer, flat(700));
    expect(layer.world?.origTop?.[100]).toBe(600);
  });
});
