// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 월드 크기 레이어 — jsdom은 캔버스를 못 그리니 크기만 보는 가짜로
const layers = vi.hoisted(() => ({ made: [] as { canvas: { width: number; height: number } }[] }));
vi.mock("../renderer/terrainLayer", () => ({
  createTerrainLayer: () => {
    const layer = { canvas: { width: 2048, height: 1024 } };
    layers.made.push(layer);
    return layer;
  },
  paintAll: () => {},
}));
vi.mock("../renderer/drawScene", () => ({ SLOT_COLORS: ["#38bdf8"], drawScene: () => {}, tankDrawScale: () => 1.4 }));
// 컨테이너 크기가 잡힌 캔버스 — 그리기가 바로 돈다
vi.mock("../hooks/useFortressCanvas", () => ({
  useFortressCanvas: () => ({ containerRef: { current: null }, canvasRef: { current: null }, ctxRef: { current: {} }, viewRef: { current: { width: 300, height: 150 } } }),
}));

import { TankSkinPreview } from "./TankSkinPreview";

const tanks = [{ skin: { id: "default", level: 1 } }] as const;

afterEach(() => cleanup());

describe("탱크 스킨 미리보기 레이어", () => {
  it("미리보기 여럿이 레이어 하나를 같이 쓰고, 마지막 미리보기가 사라지면 월드 크기 캔버스를 비운다", () => {
    const a = render(<TankSkinPreview tanks={tanks} label="a" />);
    const b = render(<TankSkinPreview tanks={tanks} label="b" />);
    expect(layers.made).toHaveLength(1);
    const [layer] = layers.made;
    a.unmount();
    expect(layer.canvas.width).toBe(2048);
    b.unmount();
    expect(layer.canvas).toEqual({ width: 0, height: 0 });
    // 다시 열면 새로 만든다
    render(<TankSkinPreview tanks={tanks} label="c" />);
    expect(layers.made).toHaveLength(2);
  });
});
