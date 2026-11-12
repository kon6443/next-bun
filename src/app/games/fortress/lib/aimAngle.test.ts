import { describe, it, expect } from "vitest";
import { angleSpeech, angleView, defaultAngleToward, elevate, facingOf, turnAround } from "./aimAngle";

describe("포신 각도 — 바라보는 쪽 + 높이", () => {
  it("올리기는 어느 쪽을 보든 수직(90°) 쪽, 내리기는 바라보는 쪽 수평", () => {
    expect(elevate(60, 1, 1)).toBe(61);
    expect(elevate(120, -1, 1)).toBe(119);
    expect(elevate(60, 1, -1)).toBe(59);
    expect(elevate(120, -1, -1)).toBe(121);
  });

  it("높이는 0°~90°에서 멈춘다 — 올리기로 반대쪽으로 넘어가지 않는다", () => {
    expect(elevate(90, 1, 1)).toBe(90);
    expect(elevate(90, -1, 1)).toBe(90);
    expect(elevate(0, 1, -1)).toBe(0);
    expect(elevate(180, -1, -1)).toBe(180);
    // 수직에서 내리면 바라보던 쪽으로
    expect(elevate(90, -1, -1)).toBe(91);
    expect(elevate(90, 1, -1)).toBe(89);
  });

  it("바라보는 쪽 — 수직이면 이전 쪽, 돌아서기는 높이를 지킨 좌우 대칭", () => {
    expect(facingOf(30, -1)).toBe(1);
    expect(facingOf(150, 1)).toBe(-1);
    expect(facingOf(90, -1)).toBe(-1);
    expect(turnAround(60)).toBe(120);
    expect(turnAround(90)).toBe(90);
  });

  it("첫 조준은 가까운 적 쪽 60° — 적이 없으면 오른쪽", () => {
    expect(defaultAngleToward(500, 1500)).toBe(60);
    expect(defaultAngleToward(1500, 500)).toBe(120);
    expect(defaultAngleToward(500, null)).toBe(60);
  });

  it("화면 표기는 방향 + 높이(0~90°) — 엔진 각도 120°는 ◀ 60°, 수직은 조준 중이면 바라보는 쪽, 지난 발이면 방향 없음", () => {
    expect(angleView(60)).toMatchObject({ height: 60, arrow: "▶", word: "오른쪽" });
    expect(angleView(120)).toMatchObject({ height: 60, arrow: "◀", word: "왼쪽" });
    expect(angleView(0)).toMatchObject({ height: 0, arrow: "▶" });
    expect(angleView(180)).toMatchObject({ height: 0, arrow: "◀" });
    expect(angleView(90, -1)).toMatchObject({ height: 90, arrow: "◀", word: "왼쪽" });
    expect(angleView(90)).toMatchObject({ height: 90, arrow: "", word: "수직" });
    expect(angleSpeech(135)).toBe("왼쪽 45도");
    expect(angleSpeech(90)).toBe("수직 90도");
  });
});
