// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ value: { data: null as unknown, status: "unauthenticated" } }));
vi.mock("next-auth/react", () => ({ useSession: () => session.value }));
const getFortressMatchPoints = vi.hoisted(() => vi.fn());
vi.mock("@/services/fortressService", () => ({ getFortressMatchPoints }));
vi.mock("@/app/auth/useKakaoLogin", () => ({ useKakaoLogin: () => ({ start: vi.fn(), isStarting: false }) }));

import { ApiError } from "@/types/api";
import { FortressResultPoints, earnedText, resetPointsCacheForTest } from "./FortressResultPoints";

const login = () => {
  session.value = { data: { user: { accessToken: "tok" } }, status: "authenticated" };
};
const ok = (data: unknown) => ({ code: "SUCCESS", message: "", data });

beforeEach(() => {
  getFortressMatchPoints.mockReset();
  resetPointsCacheForTest();
});
afterEach(() => {
  cleanup();
  session.value = { data: null, status: "unauthenticated" };
});

describe("결과 화면 포인트 (F7)", () => {
  it("게스트 — 부르지 않고 '로그인했다면 최대 +N P'(승리·KO 최대 3)와 로그인 버튼", () => {
    render(<FortressResultPoints matchId="m1" settled won kos={5} />);
    expect(getFortressMatchPoints).not.toHaveBeenCalled();
    expect(screen.getByTestId("fortress-points-guest").textContent).toContain("+80,000 P");
    expect(screen.getByRole("button", { name: "카카오로 로그인" })).toBeTruthy();
  });

  it("다른 탭에서 다른 계정으로 바뀌면 앞 사용자의 포인트를 보이지 않고 새 사용자로 다시 묻는다", async () => {
    session.value = { data: { user: { userId: 1, accessToken: "tok-a" } }, status: "authenticated" };
    getFortressMatchPoints.mockResolvedValueOnce(ok({ matchId: "m1", participant: true, earned: 50_000, memo: "에이" }));
    const ui = render(<FortressResultPoints matchId="m1" settled won kos={0} />);
    expect(await screen.findByText("+50,000 P")).toBeTruthy();
    session.value = { data: { user: { userId: 2, accessToken: "tok-b" } }, status: "authenticated" };
    getFortressMatchPoints.mockResolvedValueOnce(ok({ matchId: "m1", participant: false, earned: 0, memo: null }));
    ui.rerender(<FortressResultPoints matchId="m1" settled won kos={0} />);
    expect(screen.queryByText("+50,000 P")).toBeNull();
    expect(await screen.findByText("로그인하기 전에 들어온 경기라 포인트가 없어요.")).toBeTruthy();
    expect(getFortressMatchPoints).toHaveBeenLastCalledWith("m1", "tok-b");
    // 같은 사용자로 다시 열면 다시 묻지 않는다
    ui.unmount();
    render(<FortressResultPoints matchId="m1" settled won kos={0} />);
    expect(screen.getByText("로그인하기 전에 들어온 경기라 포인트가 없어요.")).toBeTruthy();
    expect(getFortressMatchPoints).toHaveBeenCalledTimes(2);
  });

  it("로그인 — 저장 대기가 끝난 뒤(settled) 1회 조회해 +N P와 memo, 다시 열어도 다시 묻지 않는다", async () => {
    login();
    getFortressMatchPoints.mockResolvedValue(ok({ matchId: "m1", participant: true, earned: 50_000, memo: "참가 20,000 · 승리 30,000" }));
    const ui = render(<FortressResultPoints matchId="m1" settled={false} won kos={0} />);
    expect(getFortressMatchPoints).not.toHaveBeenCalled();
    expect(screen.getByTestId("fortress-points").textContent).toContain("정리하는 중");
    await act(async () => ui.rerender(<FortressResultPoints matchId="m1" settled won kos={0} />));
    expect(getFortressMatchPoints).toHaveBeenCalledTimes(1);
    expect(getFortressMatchPoints).toHaveBeenCalledWith("m1", "tok");
    expect(screen.getByTestId("fortress-points").textContent).toContain("+50,000 P");
    expect(screen.getByTestId("fortress-points").textContent).toContain("참가 20,000 · 승리 30,000");
    // 결과 → 다시 보기 → 결과(다시 마운트)
    ui.unmount();
    render(<FortressResultPoints matchId="m1" settled won kos={0} />);
    expect(getFortressMatchPoints).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("fortress-points").textContent).toContain("+50,000 P");
  });

  it("로그인 — StrictMode 두 번 실행·요청 중 다시 마운트에도 요청은 1번", async () => {
    login();
    let finish!: (v: unknown) => void;
    getFortressMatchPoints.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const first = render(
      <StrictMode>
        <FortressResultPoints matchId="m1" settled won kos={0} />
      </StrictMode>,
    );
    first.unmount();
    render(<FortressResultPoints matchId="m1" settled won kos={0} />);
    expect(getFortressMatchPoints).toHaveBeenCalledTimes(1);
    await act(async () => finish(ok({ matchId: "m1", participant: true, earned: 20_000, memo: null })));
    expect(screen.getByTestId("fortress-points").textContent).toContain("+20,000 P");
  });

  it("로그인 만료(401)면 다시 로그인 안내 — 결과 화면은 그대로", async () => {
    login();
    getFortressMatchPoints.mockRejectedValueOnce(new ApiError("AUTH_UNAUTHORIZED", "만료", 401));
    await act(async () => {
      render(<FortressResultPoints matchId="m1" settled won={false} kos={0} />);
    });
    expect(screen.getByTestId("fortress-points").textContent).toContain("로그인이 만료");
    expect(screen.getByRole("button", { name: "다시 로그인" })).toBeTruthy();
  });

  it("문구 — 비참가·조건 미달·memo 없음", () => {
    expect(earnedText({ matchId: "m", participant: false, earned: 0, memo: null })).toEqual({ amount: null, detail: "로그인하기 전에 들어온 경기라 포인트가 없어요." });
    expect(earnedText({ matchId: "m", participant: true, earned: 0, memo: null }).detail).toContain("적립 조건");
    expect(earnedText({ matchId: "m", participant: true, earned: 0, memo: "일일 상한 도달" }).detail).toBe("일일 상한 도달");
    expect(earnedText({ matchId: "m", participant: true, earned: 20_000, memo: null })).toEqual({ amount: "+20,000 P", detail: "" });
  });
});
