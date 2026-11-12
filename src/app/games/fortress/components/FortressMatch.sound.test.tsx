// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// 소리 플레이어는 대역 — 어떤 신호·배경음을 요청했는지만 본다
const snd = vi.hoisted(() => ({ played: [] as string[], music: [] as (string | null)[] }));
vi.mock("../lib/sound/player", () => ({
  getFortressSound: () => ({
    play: (c: { kind: string }) => snd.played.push(c.kind),
    playCues: (cs: { kind: string }[]) => cs.forEach((c) => snd.played.push(c.kind)),
    setMusic: (t: string | null) => snd.music.push(t),
    unlock: () => {},
    musicTrack: () => null,
    dispose: () => {},
  }),
}));

import type { MatchConfig } from "../engine";
import { FortressMatch } from "./FortressMatch";

const config: MatchConfig = { seed: 7, mapId: "hills", mode: "ffa", players: [{ slot: 0, team: 0, tankId: 0 }, { slot: 1, team: 0, tankId: 1 }] };

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
beforeEach(() => {
  snd.played = [];
  snd.music = [];
  window.localStorage.setItem("fortress:guide:v1", "1");
});
afterEach(cleanup);

describe("경기 화면 소리 (D-025 보충 6)", () => {
  it("경기 배경음을 켜고, 떠나면 끈다", () => {
    const ui = render(<FortressMatch config={config} controllers={["human", 1]} onExit={() => {}} onFinish={() => {}} />);
    expect(snd.music).toEqual(["match"]);
    ui.unmount();
    expect(snd.music).toEqual(["match", null]);
  });

  it("이 기기의 사람 차례면 '내 차례', AI 차례면 짧은 턴 넘김", () => {
    render(<FortressMatch config={config} controllers={["human", 1]} onExit={() => {}} onFinish={() => {}} />);
    const first = screen.getByTestId("fortress-match").getAttribute("data-phase");
    expect(snd.played[0]).toBe(first === "aim" ? "myTurn" : "turn");
    cleanup();
    snd.played = [];
    render(<FortressMatch config={config} controllers={[1, 1]} onExit={() => {}} onFinish={() => {}} />);
    expect(snd.played[0]).toBe("turn");
  });

  it("머리줄에 설정(소리·진동) 버튼이 있다", () => {
    render(<FortressMatch config={config} controllers={["human", 1]} onExit={() => {}} onFinish={() => {}} />);
    expect(screen.getByTestId("fortress-settings-button")).toBeTruthy();
  });

  // 보충 6 리뷰 확정: 설정 시트가 열려 있어도 조준 키가 먹어 시트 뒤에서 포신이 움직이고 Space로 발사됐다
  it("설정 시트가 열려 있으면 조준 키(화살표·Space)가 먹지 않는다", () => {
    render(<FortressMatch config={config} controllers={["human", "human"]} onExit={() => {}} onFinish={() => {}} />);
    const angle = () => screen.getByTestId("fortress-angle").textContent;
    const before = angle();
    act(() => fireEvent.click(screen.getByTestId("fortress-settings-button")));
    expect(screen.getByTestId("fortress-settings")).toBeTruthy();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", code: "ArrowUp", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowUp", code: "ArrowUp", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true }));
    });
    expect(angle()).toBe(before);
    expect(screen.getByTestId("fortress-match").getAttribute("data-phase")).toBe("aim");
  });

  it("시안 데스크톱 무기 버튼은 아이콘 대신 이름으로 읽힌다(일반 무기 포함)", () => {
    render(<FortressMatch config={config} controllers={["human", "human"]} onExit={() => {}} onFinish={() => {}} />);
    expect(screen.getByRole("button", { name: "포탄" })).toBeTruthy();
  });
});
