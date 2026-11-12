import { describe, expect, it } from "vitest";
import { CAMERA_WAIT_MAX_MS, cameraWaitDone } from "./cameraWait";

describe("다음 발 전 카메라 대기", () => {
  it("카메라가 준비되면 바로, 아니면 상한(1초)까지만 기다린다", () => {
    expect(CAMERA_WAIT_MAX_MS).toBeLessThanOrEqual(1000);
    expect(cameraWaitDone(0, true)).toBe(true);
    expect(cameraWaitDone(CAMERA_WAIT_MAX_MS - 1, false)).toBe(false);
    expect(cameraWaitDone(CAMERA_WAIT_MAX_MS, false)).toBe(true);
  });
});
