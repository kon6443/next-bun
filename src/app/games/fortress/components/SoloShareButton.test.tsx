// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/types/api";
import { ENGINE_VERSION, type Action, type MatchConfig, simulateMatch } from "../engine";
import golden from "../engine/__fixtures__/golden-matches.json";

const session = vi.hoisted(() => ({ value: { data: null as null | { user: { accessToken: string } }, status: "unauthenticated" } }));
vi.mock("next-auth/react", () => ({ useSession: () => session.value }));
const svc = vi.hoisted(() => ({ uploadFortressSoloMatch: vi.fn() }));
vi.mock("@/services/fortressService", () => svc);

const { SoloShareButton } = await import("./SoloShareButton");

const g = golden[0] as unknown as { config: MatchConfig; actions: Action[] };
const sim = simulateMatch(g.config, g.actions);
if (!sim.ok) throw new Error("골든 경기 재생 실패");
const final = sim.final;
const newData = () => ({ engineVersion: ENGINE_VERSION, config: g.config, actions: g.actions });
const view = (data = newData()) => render(<SoloShareButton data={data} controllers={["human", 1]} final={final} />);
const button = () => screen.getByTestId("fortress-solo-share");
const flush = () => act(async () => await new Promise((r) => setTimeout(r, 0)));

beforeEach(() => {
  svc.uploadFortressSoloMatch.mockReset();
  session.value = { data: null, status: "unauthenticated" };
});
afterEach(cleanup);

describe("결과 화면 '기록 공유' (D-027 보충 2)", () => {
  it("자동으로 올리지 않는다 — 누를 때 한 번 올리고 받은 matchId로 공유 메뉴를 연다", async () => {
    svc.uploadFortressSoloMatch.mockResolvedValue({ code: "SUCCESS", data: { matchId: "AbCdEfGhIjKlMnOp" } });
    view();
    expect(svc.uploadFortressSoloMatch).not.toHaveBeenCalled();
    fireEvent.click(button());
    await flush();
    expect(svc.uploadFortressSoloMatch).toHaveBeenCalledTimes(1);
    const [body, token] = svc.uploadFortressSoloMatch.mock.calls[0];
    expect(Object.keys(body).sort()).toEqual(["actions", "config", "engineVersion", "slots", "stateHash"]);
    expect(token).toBeUndefined();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("dialog").textContent).toContain("경기 기록 공유");
  });

  it("같은 경기를 다시 누르면(결과 화면이 다시 마운트돼도) 다시 올리지 않고 받은 matchId를 쓴다", async () => {
    svc.uploadFortressSoloMatch.mockResolvedValue({ code: "SUCCESS", data: { matchId: "AbCdEfGhIjKlMnOp" } });
    const data = newData();
    view(data);
    fireEvent.click(button());
    await flush();
    cleanup();
    view(data);
    fireEvent.click(button());
    await flush();
    expect(svc.uploadFortressSoloMatch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeTruthy();
    // 새 판(새 기록 객체)이면 새로 올린다
    cleanup();
    view(newData());
    fireEvent.click(button());
    await flush();
    expect(svc.uploadFortressSoloMatch).toHaveBeenCalledTimes(2);
  });

  it("올리는 중에는 다시 눌러도 한 번만(aria-busy), 로그인이면 토큰을 싣는다", async () => {
    session.value = { data: { user: { accessToken: "tok" } }, status: "authenticated" };
    let resolve: (v: unknown) => void = () => {};
    svc.uploadFortressSoloMatch.mockReturnValue(new Promise((r) => (resolve = r)));
    view();
    fireEvent.click(button());
    await flush();
    expect(button().getAttribute("aria-busy")).toBe("true");
    expect(button().textContent).toBe("올리는 중…");
    fireEvent.click(button());
    await flush();
    expect(svc.uploadFortressSoloMatch).toHaveBeenCalledTimes(1);
    expect(svc.uploadFortressSoloMatch.mock.calls[0][1]).toBe("tok");
    resolve({ code: "SUCCESS", data: { matchId: "AbCdEfGhIjKlMnOp" } });
    await flush();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("일시적인 실패(429·연결)는 메뉴를 열지 않고 안내, 다시 누르면 다시 시도", async () => {
    svc.uploadFortressSoloMatch.mockRejectedValueOnce(new ApiError("TOO_MANY_REQUESTS", "x", 429)).mockResolvedValueOnce({ code: "SUCCESS", data: { matchId: "AbCdEfGhIjKlMnOp" } });
    view();
    const status = screen.getByTestId("fortress-solo-share-status");
    expect(status.getAttribute("role")).toBe("status");
    fireEvent.click(button());
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(status.textContent).toContain("잠시 후");
    fireEvent.click(button());
    await flush();
    expect(svc.uploadFortressSoloMatch).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(status.textContent).toBe("");
  });

  it.each([
    [new ApiError("FORTRESS_SOLO_ENGINE_MISMATCH", "x", 409), "새 버전"],
    [new ApiError("FORTRESS_SOLO_REPLAY_INVALID", "x", 422, undefined, { reason: "ACTION", at: 3 }), "확인하지 못해"],
    [new ApiError("UNKNOWN_ERROR", "Payload Too Large", 413), "너무 길어"],
  ])("다시 보내도 소용없는 실패(%s)는 안내를 남기고 그 경기에서 버튼을 막는다(리마운트해도)", async (error, text) => {
    svc.uploadFortressSoloMatch.mockRejectedValue(error);
    const data = newData();
    view(data);
    fireEvent.click(button());
    await flush();
    expect(screen.getByTestId("fortress-solo-share-status").textContent).toContain(text);
    expect(button().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button());
    await flush();
    cleanup();
    view(data);
    expect(screen.getByTestId("fortress-solo-share-status").textContent).toContain(text);
    fireEvent.click(button());
    await flush();
    expect(svc.uploadFortressSoloMatch).toHaveBeenCalledTimes(1);
  });

  // 리뷰 확정 결함: 올리는 중에 다시 보기로 갔다 와서 누르면 같은 경기를 두 번 올렸다
  it("올리는 중에 결과 화면을 떠났다 와서 눌러도 같은 요청을 기다린다(두 번 올리지 않는다)", async () => {
    let resolve: (v: unknown) => void = () => {};
    svc.uploadFortressSoloMatch.mockReturnValue(new Promise((r) => (resolve = r)));
    const data = newData();
    view(data);
    fireEvent.click(button());
    await flush();
    cleanup();
    view(data);
    fireEvent.click(button());
    await flush();
    expect(button().textContent).toBe("올리는 중…");
    resolve({ code: "SUCCESS", data: { matchId: "AbCdEfGhIjKlMnOp" } });
    await flush();
    expect(svc.uploadFortressSoloMatch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  // 리뷰 확정 결함: 올리는 중 다시 마운트된 화면이 떠난 화면의 영구 실패를 모르고 한 번 더 보냈다
  it("올리는 중 다시 마운트된 화면도 진행 상태를 보이고, 떠난 화면의 요청이 영구 실패로 끝나면 막힌다(다시 보내지 않는다)", async () => {
    let reject: (e: unknown) => void = () => {};
    svc.uploadFortressSoloMatch.mockReturnValue(new Promise((_, r) => (reject = r)));
    const data = newData();
    view(data);
    fireEvent.click(button());
    await flush();
    cleanup();
    view(data);
    expect(button().textContent).toBe("올리는 중…");
    reject(new ApiError("FORTRESS_SOLO_ENGINE_MISMATCH", "x", 409));
    await flush();
    expect(button().getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByTestId("fortress-solo-share-status").textContent).toContain("새 버전");
    fireEvent.click(button());
    await flush();
    expect(svc.uploadFortressSoloMatch).toHaveBeenCalledTimes(1);
  });

  it("이미 받은 matchId면 누르는 즉시 메뉴(올리는 중 표시 없이)", async () => {
    svc.uploadFortressSoloMatch.mockResolvedValue({ code: "SUCCESS", data: { matchId: "AbCdEfGhIjKlMnOp" } });
    const data = newData();
    view(data);
    fireEvent.click(button());
    await flush();
    cleanup();
    view(data);
    fireEvent.click(button());
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(button().textContent).toBe("기록 공유");
  });

  it("올릴 수 없는 기록(끝나지 않은 경기)이면 버튼을 그리지 않는다", () => {
    render(<SoloShareButton data={{ ...newData(), actions: g.actions.slice(0, 2) }} controllers={["human", 1]} final={final} />);
    expect(screen.queryByTestId("fortress-solo-share")).toBeNull();
  });
});
