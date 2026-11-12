// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MatchConfig } from "../engine";
import { FortressMatch } from "./FortressMatch";

/** 조작 발견성(F1c) — 처음 1회 안내, 이동이 연료 게이지에 보이는지, 안내 중엔 조준 키를 받지 않는지 */
const config: MatchConfig = {
  seed: 7,
  mapId: "hills",
  mode: "ffa",
  players: [
    { slot: 0, team: 0, tankId: 0 },
    { slot: 1, team: 0, tankId: 1 },
  ],
};

beforeAll(() => {
  // jsdom에는 캔버스·ResizeObserver가 없다 — 그리기는 건너뛰고 조작부만 본다
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

const renderMatch = () => render(<FortressMatch config={config} controllers={["human", 1]} onExit={() => {}} onFinish={() => {}} />);
/** 발사가 받아들여지면 연출 단계로 넘어가 조작부가 inert가 된다 */
const fired = () => screen.getByTestId("fortress-hud").closest("[inert]") !== null;
const fuel = () => screen.getByTestId("fortress-fuel").getAttribute("aria-label");
/** HUD 각도 — 방향 화살표 + (낭독용 낱말) + 높이. 엔진 각도(0~180)가 아니라 원작처럼 높이(0~90°) */
const angleText = () => screen.getByTestId("fortress-angle").textContent;

describe("FortressMatch 조작 안내·이동", () => {
  it("처음엔 조작 안내가 뜨고, 닫으면 다음 경기부터는 뜨지 않는다", () => {
    renderMatch();
    expect(screen.getByTestId("fortress-guide")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "알겠어요" }));
    expect(screen.queryByTestId("fortress-guide")).toBeNull();
    cleanup();
    renderMatch();
    expect(screen.queryByTestId("fortress-guide")).toBeNull();
    // ? 버튼으로 다시 연다
    fireEvent.click(screen.getByTestId("fortress-help"));
    expect(screen.getByTestId("fortress-guide")).toBeInTheDocument();
  });

  it("◀▶·A/D 이동이 연료 게이지에 보이고, 안내가 열려 있는 동안은 키를 받지 않는다", () => {
    renderMatch();
    expect(fuel()).toBe("연료 100 / 100");
    fireEvent.keyDown(window, { key: "d", code: "KeyD" });
    expect(fuel()).toBe("연료 100 / 100");

    fireEvent.click(screen.getByRole("button", { name: "알겠어요" }));
    fireEvent.keyDown(window, { key: "d", code: "KeyD" });
    expect(fuel()).toBe("연료 98 / 100");
    // 키보드·보조기술 클릭(detail 0)은 한 번 이동
    fireEvent.click(screen.getByRole("button", { name: "오른쪽으로 이동" }));
    expect(fuel()).toBe("연료 96 / 100");
    // 오른쪽을 보고 있으니 왼쪽은 먼저 돌아서기만(연료 그대로) — 그다음부터 이동
    fireEvent.click(screen.getByRole("button", { name: "왼쪽으로 돌아서기" }));
    expect(fuel()).toBe("연료 96 / 100");
    fireEvent.click(screen.getByRole("button", { name: "왼쪽으로 이동" }));
    expect(fuel()).toBe("연료 98 / 100");
    expect(screen.getByTestId("fortress-hud")).toHaveTextContent("→ 2");
  });

  it("발사는 하나 — 키보드·보조기술 클릭(detail 0)은 맞춘 파워로 바로 쏜다", () => {
    window.localStorage.setItem("fortress:guide:v1", "1");
    renderMatch();
    expect(fired()).toBe(false);
    fireEvent.click(screen.getByTestId("fortress-fire"));
    expect(fired()).toBe(true);
  });

  it("발사 버튼 탭(짧게 누르기)은 한 번만 쏜다 — 뒤따르는 click을 두 번째 발사로 치지 않는다", () => {
    window.localStorage.setItem("fortress:guide:v1", "1");
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(1000);
    renderMatch();
    const fire = screen.getByTestId("fortress-fire");
    fire.setPointerCapture = () => {};
    fireEvent.pointerDown(fire, { pointerId: 1 });
    now.mockReturnValue(1100);
    fireEvent.pointerUp(fire, { pointerId: 1 });
    expect(fired()).toBe(true);
    // 같은 탭의 click — 무시(연출 중이라 받아도 commit이 막지만, 핸들러가 먼저 거른다)
    fireEvent.click(fire, { detail: 1 });
    expect(fired()).toBe(true);
    now.mockRestore();
  });

  it("▶·D·→ 모두 오른쪽으로 — 이동 미리보기 x(엔진 walk)가 실제로 늘어나고, 반대쪽 첫 입력은 돌아서기", () => {
    window.localStorage.setItem("fortress:guide:v1", "1");
    renderMatch();
    const hud = screen.getByTestId("fortress-hud");
    const x0 = Number(hud.getAttribute("data-tank-x"));
    expect(Number(hud.getAttribute("data-preview-x"))).toBe(x0);
    // 첫 턴은 가까운 적(오른쪽) 쪽 60°
    expect(angleText()).toBe("▶ 오른쪽 60°");
    fireEvent.click(screen.getByRole("button", { name: "오른쪽으로 이동" }));
    expect(Number(hud.getAttribute("data-preview-x"))).toBe(x0 + 2);
    fireEvent.keyDown(window, { key: "d", code: "KeyD" });
    fireEvent.keyDown(window, { key: "ArrowRight", code: "ArrowRight" });
    expect(Number(hud.getAttribute("data-preview-x"))).toBe(x0 + 6);
    // ← 첫 입력 — 돌아서기만: 위치 그대로, 높이는 그대로 방향만(엔진 각도 60° → 120°)
    fireEvent.keyDown(window, { key: "ArrowLeft", code: "ArrowLeft" });
    expect(Number(hud.getAttribute("data-preview-x"))).toBe(x0 + 6);
    expect(angleText()).toBe("◀ 왼쪽 60°");
    fireEvent.click(screen.getByRole("button", { name: "왼쪽으로 이동" }));
    fireEvent.keyDown(window, { key: "a", code: "KeyA" });
    fireEvent.keyDown(window, { key: "ArrowLeft", code: "ArrowLeft" });
    expect(Number(hud.getAttribute("data-preview-x"))).toBe(x0);
  });

  it("↑↓·W/S·▲▼는 바라보는 쪽 기준 포신 높이, Q/E는 파워 ±1 — 한글 입력 상태(물리 키)에서도", () => {
    window.localStorage.setItem("fortress:guide:v1", "1");
    renderMatch();
    const power = () => screen.getByTestId("fortress-power").getAttribute("aria-valuetext");
    fireEvent.keyDown(window, { key: "ArrowUp", code: "ArrowUp" });
    fireEvent.keyDown(window, { key: "ㅈ", code: "KeyW" });
    fireEvent.click(screen.getByRole("button", { name: "포신 올리기" }));
    expect(angleText()).toBe("▶ 오른쪽 63°");
    fireEvent.keyDown(window, { key: "ㄴ", code: "KeyS" });
    fireEvent.click(screen.getByRole("button", { name: "포신 내리기" }));
    expect(angleText()).toBe("▶ 오른쪽 61°");
    // 왼쪽으로 돌아선 뒤의 "올리기"도 수직 쪽(높이 61 → 62, 엔진 각도 119° → 118°) — 발사 버튼 이름도 같은 표기
    fireEvent.keyDown(window, { key: "ArrowLeft", code: "ArrowLeft" });
    expect(angleText()).toBe("◀ 왼쪽 61°");
    fireEvent.keyDown(window, { key: "ArrowUp", code: "ArrowUp" });
    expect(angleText()).toBe("◀ 왼쪽 62°");
    expect(screen.getByTestId("fortress-fire")).toHaveAccessibleName("발사 60, 왼쪽 62도");
    fireEvent.keyDown(window, { key: "ㅂ", code: "KeyQ" });
    fireEvent.keyDown(window, { key: "ㅂ", code: "KeyQ" });
    fireEvent.keyDown(window, { key: "ㄷ", code: "KeyE" });
    expect(power()).toBe("파워 59");
  });

  it("수직(90°)에서 돌아서면 각도는 그대로여도 버튼 이름이 바로 바뀌고, 내리기는 돌아선 쪽으로", () => {
    window.localStorage.setItem("fortress:guide:v1", "1");
    renderMatch();
    for (let i = 0; i < 40; i++) fireEvent.keyDown(window, { key: "ArrowUp", code: "ArrowUp" });
    expect(angleText()).toBe("▶ 오른쪽 90°");
    expect(screen.getByRole("button", { name: "포신 올리기" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: "왼쪽으로 돌아서기" }));
    // 수직에서도 지금 바라보는 쪽을 보인다
    expect(angleText()).toBe("◀ 왼쪽 90°");
    expect(screen.getByRole("button", { name: "왼쪽으로 이동" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "오른쪽으로 돌아서기" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowDown", code: "ArrowDown" });
    expect(angleText()).toBe("◀ 왼쪽 89°");
  });

  it("스페이스로 충전하는 중에 안내를 열면 충전을 버린다(닫은 뒤 짧은 스페이스가 예전 충전으로 쏘지 않게)", () => {
    window.localStorage.setItem("fortress:guide:v1", "1");
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(1000);
    renderMatch();
    fireEvent.keyDown(window, { key: " ", code: "Space" });
    now.mockReturnValue(2500);
    fireEvent.click(screen.getByTestId("fortress-help"));
    fireEvent.click(screen.getByRole("button", { name: "알겠어요" }));
    // 새로 누른 짧은 스페이스 — 맞춘 파워(60)로 쏜다
    now.mockReturnValue(3000);
    fireEvent.keyDown(window, { key: " ", code: "Space" });
    now.mockReturnValue(3100);
    fireEvent.keyUp(window, { key: " ", code: "Space" });
    expect(fired()).toBe(true);
    // 예전 충전(1000ms부터)이 남았다면 파워 100으로 쐈을 것 — 발사 버튼 이름에 쓴 파워가 보인다
    expect(screen.getByTestId("fortress-fire")).toHaveAccessibleName(/^발사 60,/);
    now.mockRestore();
  });

  it("진행 중에 「설정으로」는 확인부터 — 키보드 Space로 눌려도 바로 나가지 않고, 확인해야 나간다", () => {
    window.localStorage.setItem("fortress:guide:v1", "1");
    const onExit = vi.fn();
    render(<FortressMatch config={config} controllers={["human", 1]} onExit={onExit} onFinish={() => {}} />);
    const back = screen.getByRole("button", { name: "설정으로" });
    back.focus();
    // 포커스된 버튼의 Space는 버튼 몫(aimKeys) — 브라우저가 click으로 바꾼다
    fireEvent.keyDown(back, { key: " ", code: "Space" });
    fireEvent.click(back, { detail: 0 });
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "경기를 그만둘까요?" })).toBeInTheDocument();
    // 확인 창이 떠 있는 동안 조준 키는 받지 않는다
    fireEvent.keyDown(window, { key: "d", code: "KeyD" });
    expect(fuel()).toBe("연료 100 / 100");
    fireEvent.click(screen.getByRole("button", { name: "계속하기" }));
    expect(screen.queryByRole("dialog", { name: "경기를 그만둘까요?" })).toBeNull();
    expect(onExit).not.toHaveBeenCalled();
    fireEvent.click(back);
    fireEvent.click(screen.getByRole("button", { name: "그만두기" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
