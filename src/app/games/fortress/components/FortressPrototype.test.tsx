// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const session = vi.hoisted(() => ({ value: { data: null as unknown, status: "unauthenticated" } }));
vi.mock("next-auth/react", () => ({ useSession: () => session.value }));
const svc = vi.hoisted(() => ({ getMyFortressSkins: vi.fn() }));
vi.mock("@/services/fortressService", () => svc);

// 경기·결과·다시 보기는 대역 — 넘겨받은 스킨만 본다(D-025)
const seen = vi.hoisted(() => ({ match: null as unknown, replay: null as unknown }));
vi.mock("./FortressMatch", () => ({
  FortressMatch: (p: { skins?: unknown; config: unknown; onFinish: (r: unknown) => void }) => {
    seen.match = p.skins;
    return (
      <button type="button" onClick={() => p.onFinish({ engineVersion: 2, config: p.config, actions: [] })}>
        경기 끝
      </button>
    );
  },
}));
vi.mock("./FortressResult", () => ({
  FortressResult: (p: { onReplay: () => void; onRematch: () => void }) => (
    <>
      <button type="button" onClick={p.onReplay}>
        다시 보기
      </button>
      <button type="button" onClick={p.onRematch}>
        다시하기
      </button>
    </>
  ),
}));
// 기본 그림이 vivid(보충 5)라 결과 화면은 FortressResultVivid — 같은 버튼 둘짜리 대역(classic은 위 FortressResult)
vi.mock("./FortressResultVivid", () => ({
  FortressResultVivid: (p: { onReplay: () => void; onRematch: () => void }) => (
    <>
      <button type="button" onClick={p.onReplay}>
        다시 보기
      </button>
      <button type="button" onClick={p.onRematch}>
        다시하기
      </button>
    </>
  ),
}));
vi.mock("./FortressReplay", () => ({
  FortressReplay: (p: { skins?: unknown; onClose: () => void }) => {
    seen.replay = p.skins;
    return (
      <button type="button" onClick={p.onClose}>
        결과로
      </button>
    );
  },
}));

import { DEFAULT_TANK_SKIN } from "../lib/tankSkins";
import FortressPrototype, { localSkins, setupForVs } from "./FortressPrototype";

beforeEach(() => {
  svc.getMyFortressSkins.mockReset();
  seen.match = null;
  seen.replay = null;
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  session.value = { data: null, status: "unauthenticated" };
});

/** P2의 조작 칸에서 눌린 선택지 이름 */
const p2Controller = () => within(screen.getByRole("group", { name: "P2 조작" })).getByRole("button", { pressed: true }).textContent;

describe("설정 화면 — 홈 진입(?vs) 기본 구성", () => {
  it("setupForVs — ai: P1 사람 + 나머지 AI 중, local: 전원 사람, 모르는 값: 기본 구성", () => {
    expect(setupForVs("ai").controllers).toEqual(["human", 1, 1, 1]);
    expect(setupForVs("local").controllers).toEqual(["human", "human", "human", "human"]);
    // 모르는 값·없음은 기본 구성 — 값으로 고정(같은 함수 두 번 비교는 늘 통과한다)
    expect(setupForVs("weird").controllers).toEqual(["human", 1, 1, 1]);
    expect(setupForVs(null).controllers).toEqual(["human", 1, 1, 1]);
    // 늘 새 배열 — 받은 쪽이 바꿔도 다음 호출에 새지 않는다
    setupForVs("local").controllers[1] = 2;
    expect(setupForVs("local").controllers[1]).toBe("human");
  });

  it.each([
    ["?vs=local", "사람"],
    ["?vs=ai", "AI 중"],
    ["?vs=bogus", "AI 중"],
    ["", "AI 중"],
  ])("주소 %s → P2는 %s", (query, expected) => {
    window.history.replaceState(null, "", `/games/fortress/play${query}`);
    render(<FortressPrototype />);
    expect(p2Controller()).toBe(expected);
    expect(screen.getByRole("link", { name: "← 포트리스" })).toHaveAttribute("href", "/games/fortress");
  });

  it("들어온 뒤 사용자가 고른 값은 덮어쓰지 않는다(?vs는 처음 한 번만)", () => {
    window.history.replaceState(null, "", "/games/fortress/play?vs=local");
    render(<FortressPrototype />);
    fireEvent.click(within(screen.getByRole("group", { name: "P2 조작" })).getByRole("button", { name: "AI 상" }));
    expect(p2Controller()).toBe("AI 상");
    fireEvent.click(screen.getByRole("button", { name: "3명" }));
    expect(p2Controller()).toBe("AI 상");
  });
});

describe("혼자하기 스킨 (D-025) — 첫 사람 자리만 내 장착 스킨, 나머지·게스트·실패는 기본", () => {
  const neon3 = { id: "neon", level: 3 } as const;

  it("localSkins — 첫 사람 자리만 내 스킨(AI·같은 기기의 다른 사람·사람 없음은 기본)", () => {
    expect(localSkins(["human", 1], neon3)).toEqual([neon3, DEFAULT_TANK_SKIN]);
    expect(localSkins([2, "human", "human"], neon3)).toEqual([DEFAULT_TANK_SKIN, neon3, DEFAULT_TANK_SKIN]);
    expect(localSkins([2, 2, 2, 2], neon3)).toEqual([DEFAULT_TANK_SKIN, DEFAULT_TANK_SKIN, DEFAULT_TANK_SKIN, DEFAULT_TANK_SKIN]);
  });

  it("로그인하면 장착 스킨으로 경기를 그리고, 다시 보기도 그 경기 당시 스킨", async () => {
    session.value = { data: { user: { accessToken: "tok" } }, status: "authenticated" };
    svc.getMyFortressSkins.mockResolvedValue({ code: "SUCCESS", message: "", data: { equipped: neon3 } });
    window.history.replaceState(null, "", "/?vs=local");
    await act(async () => {
      render(<FortressPrototype />);
    });
    expect(svc.getMyFortressSkins).toHaveBeenCalledWith("tok");
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    expect(seen.match).toEqual([neon3, DEFAULT_TANK_SKIN]);
    fireEvent.click(screen.getByRole("button", { name: "경기 끝" }));
    fireEvent.click(screen.getByRole("button", { name: "다시 보기" }));
    expect(seen.replay).toEqual([neon3, DEFAULT_TANK_SKIN]);
  });

  it("게스트는 조회 없이 기본 스킨", async () => {
    await act(async () => {
      render(<FortressPrototype />);
    });
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    expect(svc.getMyFortressSkins).not.toHaveBeenCalled();
    expect(seen.match).toEqual([DEFAULT_TANK_SKIN, DEFAULT_TANK_SKIN]);
  });

  it("조회에 실패하면 기본 스킨으로 경기", async () => {
    session.value = { data: { user: { accessToken: "tok" } }, status: "authenticated" };
    svc.getMyFortressSkins.mockRejectedValue(new Error("boom"));
    await act(async () => {
      render(<FortressPrototype />);
    });
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    expect(seen.match).toEqual([DEFAULT_TANK_SKIN, DEFAULT_TANK_SKIN]);
  });

  // 리뷰 확정(D-025 A): 시작 뒤 장착이 바뀌어도 그 경기·다시 보기는 당시 스킨이어야 한다(지금 스킨을 넘기면 실패)
  it("시작 뒤 장착 스킨이 바뀌어도 그 경기·다시 보기는 시작 때 스킨, 다시하기부터 새 스킨", async () => {
    const arctic4 = { id: "arctic", level: 4 } as const;
    session.value = { data: { user: { accessToken: "tok" } }, status: "authenticated" };
    svc.getMyFortressSkins.mockResolvedValueOnce({ code: "SUCCESS", message: "", data: { equipped: neon3 } });
    const view = await act(async () => render(<FortressPrototype />));
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    // 다른 계정으로 다시 로그인 — 장착이 눈보라 Lv4
    session.value = { data: { user: { accessToken: "tok2" } }, status: "authenticated" };
    svc.getMyFortressSkins.mockResolvedValueOnce({ code: "SUCCESS", message: "", data: { equipped: arctic4 } });
    await act(async () => view.rerender(<FortressPrototype />));
    expect(seen.match).toEqual([neon3, DEFAULT_TANK_SKIN]);
    fireEvent.click(screen.getByRole("button", { name: "경기 끝" }));
    fireEvent.click(screen.getByRole("button", { name: "다시 보기" }));
    expect(seen.replay).toEqual([neon3, DEFAULT_TANK_SKIN]);
    fireEvent.click(screen.getByRole("button", { name: "결과로" }));
    fireEvent.click(screen.getByRole("button", { name: "다시하기" }));
    expect(seen.match).toEqual([arctic4, DEFAULT_TANK_SKIN]);
  });

  // 리뷰 의심(D-025 A): 장착을 불러오는 중에 시작하면 그 경기 내내 기본이었다 — 응답이 오면 내 자리 스킨을 한 번 정한다
  it("장착을 불러오는 중에 시작하면 응답이 오는 순간 내 자리 스킨을 정하고, 다시 보기도 그 스킨", async () => {
    session.value = { data: { user: { accessToken: "tok" } }, status: "authenticated" };
    let respond: (v: unknown) => void = () => {};
    svc.getMyFortressSkins.mockImplementationOnce(() => new Promise((r) => (respond = r)));
    const view = await act(async () => render(<FortressPrototype />));
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    expect(seen.match).toEqual([DEFAULT_TANK_SKIN, DEFAULT_TANK_SKIN]);
    await act(async () => respond({ code: "SUCCESS", message: "", data: { equipped: neon3 } }));
    expect(seen.match).toEqual([neon3, DEFAULT_TANK_SKIN]);
    // 한 번만 정한다 — 그 뒤 다른 계정 장착(눈보라 Lv4)으로 바뀌어도 이 경기·다시 보기는 그대로
    session.value = { data: { user: { accessToken: "tok2" } }, status: "authenticated" };
    svc.getMyFortressSkins.mockResolvedValueOnce({ code: "SUCCESS", message: "", data: { equipped: { id: "arctic", level: 4 } } });
    await act(async () => view.rerender(<FortressPrototype />));
    expect(seen.match).toEqual([neon3, DEFAULT_TANK_SKIN]);
    fireEvent.click(screen.getByRole("button", { name: "경기 끝" }));
    fireEvent.click(screen.getByRole("button", { name: "다시 보기" }));
    expect(seen.replay).toEqual([neon3, DEFAULT_TANK_SKIN]);
  });

  it("불러오는 중에 시작해 결과 화면에서 응답이 와도 다시 보기는 그 스킨", async () => {
    session.value = { data: { user: { accessToken: "tok" } }, status: "authenticated" };
    let respond: (v: unknown) => void = () => {};
    svc.getMyFortressSkins.mockImplementationOnce(() => new Promise((r) => (respond = r)));
    await act(async () => {
      render(<FortressPrototype />);
    });
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    fireEvent.click(screen.getByRole("button", { name: "경기 끝" }));
    await act(async () => respond({ code: "SUCCESS", message: "", data: { equipped: neon3 } }));
    fireEvent.click(screen.getByRole("button", { name: "다시 보기" }));
    expect(seen.replay).toEqual([neon3, DEFAULT_TANK_SKIN]);
  });
});
