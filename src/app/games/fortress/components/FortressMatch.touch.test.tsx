// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchConfig } from "../engine";
import { FortressMatch } from "./FortressMatch";

/** 터치 패드(D-025 보충 2) — 터치 기기(pointer: coarse)에서만 공용 GamePad, 데스크톱은 기존 조작부 */
const config: MatchConfig = { seed: 7, mapId: "hills", mode: "ffa", players: [{ slot: 0, team: 0, tankId: 0 }, { slot: 1, team: 0, tankId: 1 }] };

let coarse = true;
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
beforeEach(() => {
  coarse = true;
  window.localStorage.setItem("fortress:guide:v1", "1");
  window.matchMedia = ((query: string) => ({
    matches: query === "(pointer: coarse)" ? coarse : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  // @ts-expect-error — 테스트가 붙인 대역을 걷어 낸다
  delete window.matchMedia;
});

const renderMatch = () => render(<FortressMatch config={config} controllers={["human", 1]} onExit={() => {}} onFinish={() => {}} />);
const phase = () => screen.getByTestId("fortress-match").getAttribute("data-phase");
const angleText = () => screen.getByTestId("fortress-angle").textContent;
/** 십자 패드 — 150px 정사각형으로 재고 그 방향 자리를 누른다 */
function pressDpad(dir: "up" | "down" | "left" | "right") {
  const pad = screen.getByTestId("game-pad-dpad");
  vi.spyOn(pad, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 150, height: 150, right: 150, bottom: 150, x: 0, y: 0, toJSON: () => ({}) });
  const at = { up: [75, 10], down: [75, 140], left: [10, 75], right: [140, 75] }[dir];
  fireEvent.pointerDown(pad, { pointerId: 1, clientX: at[0], clientY: at[1] });
  return () => fireEvent.pointerUp(pad, { pointerId: 1 });
}

describe("FortressMatch 터치 패드 (D-025 보충 2)", () => {
  it("터치면 공용 패드 + 파워 슬라이더 줄(넘기기), 데스크톱 조작부(무기 칩·이동 버튼)는 없다 — 마우스면 그 반대", () => {
    renderMatch();
    expect(screen.getByTestId("game-pad")).toBeInTheDocument();
    expect(screen.getByTestId("fortress-power")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "넘기기" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "무기" })).toBeNull();
    expect(screen.queryByRole("group", { name: "이동·각도" })).toBeNull();
    cleanup();
    coarse = false;
    renderMatch();
    expect(screen.queryByTestId("game-pad")).toBeNull();
    expect(screen.getByRole("group", { name: "무기" })).toBeInTheDocument();
  });

  it("십자 ▲는 포신을 올리고, ◀는 반대쪽을 보면 돌아서기", () => {
    renderMatch();
    const before = angleText();
    const upEnd = pressDpad("up");
    upEnd();
    expect(angleText()).not.toBe(before);
    expect(angleText()).toContain("61°");
    // 첫 차례 탱크는 오른쪽(▶)을 본다 — ◀ 첫 누름은 돌아서기
    const leftEnd = pressDpad("left");
    leftEnd();
    expect(angleText()).toContain("◀");
  });

  it("발사를 짧게 누르면 맞춘 파워로 쏜다", () => {
    renderMatch();
    const fire = screen.getByTestId("pad-fire");
    fireEvent.pointerDown(fire, { pointerId: 3 });
    fireEvent.pointerUp(fire, { pointerId: 3 });
    expect(phase()).toBe("play");
  });

  // 키보드·스위치·화면 낭독기(click detail 0)는 패드가 누름·뗌을 같은 순간에 보낸다 — 충전 상태가 아직 없어도 쏴야 한다
  it("발사를 키보드·보조기기로 누르면(click detail 0) 맞춘 파워로 쏜다", () => {
    renderMatch();
    act(() => {
      fireEvent.click(screen.getByTestId("pad-fire"), { detail: 0 });
    });
    expect(phase()).toBe("play");
  });

  // 리뷰 확정(D-025 보충 2 3차): 충전 중 전화·알림·앱 전환(blur·숨김)이나 시스템 제스처(pointercancel)가 오면 쏘지 않는다 — 데스크톱 버튼·키보드와 같다
  it.each([
    ["창 blur(앱 전환·알림)", () => window.dispatchEvent(new Event("blur"))],
    ["화면 숨김", () => {
      vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      document.dispatchEvent(new Event("visibilitychange"));
    }],
    ["pointercancel(시스템 제스처)", () => fireEvent.pointerCancel(screen.getByTestId("pad-fire"), { pointerId: 3 })],
  ])("발사를 충전하는 중 %s — 쏘지 않고 버린다", (_, cancel) => {
    renderMatch();
    fireEvent.pointerDown(screen.getByTestId("pad-fire"), { pointerId: 3 });
    act(() => cancel());
    expect(phase()).toBe("aim");
    // 버린 뒤 다시 누르고 정상으로 떼면 쏜다
    fireEvent.pointerDown(screen.getByTestId("pad-fire"), { pointerId: 4 });
    fireEvent.pointerUp(screen.getByTestId("pad-fire"), { pointerId: 4 });
    expect(phase()).toBe("play");
  });

  it("무기 버튼은 누를 때마다 다음 무기 — 접근 이름이 지금 무기를 알린다", () => {
    renderMatch();
    const weapon = screen.getByTestId("pad-weapon");
    expect(weapon).toHaveAccessibleName("무기 바꾸기 — 지금 포탄");
    fireEvent.pointerDown(weapon, { pointerId: 4 });
    expect(screen.getByTestId("pad-weapon")).toHaveAccessibleName("무기 바꾸기 — 지금 대형탄");
  });

  it("쏜 뒤(남의 차례)엔 패드가 같은 자리에 흐리게 남고 눌러도 무동작", () => {
    renderMatch();
    const fire = screen.getByTestId("pad-fire");
    fireEvent.pointerDown(fire, { pointerId: 3 });
    fireEvent.pointerUp(fire, { pointerId: 3 });
    const controls = screen.getByTestId("fortress-touch-controls");
    expect(controls).toHaveAttribute("inert");
    expect(screen.getByTestId("game-pad")).toBeInTheDocument();
    const before = angleText();
    pressDpad("up")();
    expect(angleText()).toBe(before);
    const weapon = screen.getByTestId("pad-weapon").getAttribute("aria-label");
    fireEvent.pointerDown(screen.getByTestId("pad-weapon"), { pointerId: 5 });
    expect(screen.getByTestId("pad-weapon").getAttribute("aria-label")).toBe(weapon);
  });
});
