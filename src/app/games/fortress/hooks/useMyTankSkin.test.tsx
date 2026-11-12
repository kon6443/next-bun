// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ value: { data: null as unknown, status: "unauthenticated" } }));
vi.mock("next-auth/react", () => ({ useSession: () => session.value }));
const svc = vi.hoisted(() => ({ getMyFortressSkins: vi.fn() }));
vi.mock("@/services/fortressService", () => svc);

import { DEFAULT_TANK_SKIN } from "../lib/tankSkins";
import { useMyTankSkin } from "./useMyTankSkin";

const login = (token = "tok") => {
  session.value = { data: { user: { accessToken: token } }, status: "authenticated" };
};
const ok = (equipped: unknown) => ({ code: "SUCCESS", message: "", data: { equipped } });

beforeEach(() => svc.getMyFortressSkins.mockReset());
afterEach(() => {
  cleanup();
  session.value = { data: null, status: "unauthenticated" };
});

describe("useMyTankSkin (D-025)", () => {
  it("게스트는 조회 없이 기본", () => {
    const { result } = renderHook(() => useMyTankSkin());
    expect(result.current).toEqual({ skin: DEFAULT_TANK_SKIN, status: "guest" });
    expect(svc.getMyFortressSkins).not.toHaveBeenCalled();
  });

  it("로그인 확인 중에는 조회하지 않고 기본", () => {
    session.value = { data: null, status: "loading" };
    const { result } = renderHook(() => useMyTankSkin());
    expect(result.current.skin).toEqual(DEFAULT_TANK_SKIN);
    expect(svc.getMyFortressSkins).not.toHaveBeenCalled();
  });

  it("로그인하면 장착 스킨·레벨, 모르는 id는 기본", async () => {
    login();
    svc.getMyFortressSkins.mockResolvedValueOnce(ok({ id: "arctic", level: 4 }));
    const { result, rerender } = renderHook(() => useMyTankSkin());
    expect(result.current.status).toBe("loading");
    await act(async () => {});
    expect(result.current).toEqual({ skin: { id: "arctic", level: 4 }, status: "ready" });

    login("tok2");
    svc.getMyFortressSkins.mockResolvedValueOnce(ok({ id: "gold", level: 2 }));
    rerender();
    await act(async () => {});
    expect(result.current.skin).toEqual(DEFAULT_TANK_SKIN);
  });

  it("성공 응답에 data가 없어도 던지지 않고 기본(준비됨)", async () => {
    login();
    svc.getMyFortressSkins.mockResolvedValueOnce({ code: "SUCCESS", message: "" });
    const { result } = renderHook(() => useMyTankSkin());
    await act(async () => {});
    expect(result.current).toEqual({ skin: DEFAULT_TANK_SKIN, status: "ready" });
  });

  it("실패하면 기본", async () => {
    login();
    svc.getMyFortressSkins.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useMyTankSkin());
    await act(async () => {});
    expect(result.current).toEqual({ skin: DEFAULT_TANK_SKIN, status: "error" });
  });

  it("토큰이 바뀐 뒤 늦게 온 이전 응답은 버린다", async () => {
    login("a");
    let resolveOld: (v: unknown) => void = () => {};
    svc.getMyFortressSkins.mockImplementationOnce(() => new Promise((r) => (resolveOld = r)));
    const { result, rerender } = renderHook(() => useMyTankSkin());
    login("b");
    svc.getMyFortressSkins.mockResolvedValueOnce(ok({ id: "desert", level: 2 }));
    rerender();
    await act(async () => {});
    await act(async () => resolveOld(ok({ id: "neon", level: 5 })));
    expect(result.current.skin).toEqual({ id: "desert", level: 2 });
  });
});
