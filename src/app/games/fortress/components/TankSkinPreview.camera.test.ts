import { describe, expect, it } from "vitest";
import { TANK_RADIUS } from "../engine";
import { tankDrawScale } from "../renderer/drawScene";
import { previewCamera } from "./TankSkinPreview";

/** 그려지는 탱크(포신을 세운 끝 ~ 궤도 바닥, 궤도 폭)가 화면 안에 다 들어가나 */
function fits(view: { width: number; height: number }, xs: number[], ys: number[]) {
  const span = Math.max(...xs) - Math.min(...xs);
  const cam = previewCamera(view, Math.min(...xs), span, Math.min(...ys), Math.max(...ys));
  const R = TANK_RADIUS * tankDrawScale(cam.zoom);
  const halfW = view.width / 2 / cam.zoom;
  const halfH = view.height / 2 / cam.zoom;
  const top = cam.cy - halfH;
  const bottom = cam.cy + halfH;
  return {
    barrel: ys.every((y) => y - R * 3.05 >= top),
    tread: ys.every((y) => y <= bottom),
    sides: Math.min(...xs) - R * 1.35 >= cam.cx - halfW && Math.max(...xs) + R * 1.35 <= cam.cx + halfW,
  };
}

describe("스킨 미리보기 카메라 (D-025 리뷰) — 그려지는 탱크 크기로 맞춘다", () => {
  it.each([
    ["홈 내 스킨 버튼 48×36 · 1대", { width: 48, height: 36 }, [1000], [600]],
    ["스킨 카드 300×80 · 1대", { width: 300, height: 80 }, [1000], [600]],
    ["대기실 340×96 · 4대(높이 다름)", { width: 340, height: 96 }, [900, 964, 1028, 1092], [600, 590, 612, 604]],
    ["스킨 화면 큰 미리보기 360×176 · 4대", { width: 360, height: 176 }, [900, 964, 1028, 1092], [600, 600, 600, 600]],
  ])("%s — 포신 끝·궤도 바닥·양옆이 잘리지 않는다", (_, view, xs, ys) => {
    expect(fits(view, xs, ys)).toEqual({ barrel: true, tread: true, sides: true });
  });
});
