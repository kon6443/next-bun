// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ value: { data: null as unknown, status: "unauthenticated" } }));
vi.mock("next-auth/react", () => ({ useSession: () => session.value }));
const svc = vi.hoisted(() => ({ getMyFortressSkins: vi.fn(), equipFortressSkin: vi.fn(), upgradeFortressSkin: vi.fn() }));
vi.mock("@/services/fortressService", () => svc);
vi.mock("@/app/auth/useKakaoLogin", () => ({ useKakaoLogin: () => ({ start: vi.fn(), isStarting: false }) }));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { ApiError } from "@/types/api";
import { FortressSkinsView } from "./FortressSkinsView";

type Item = { id: string; unlock: string; owned: boolean; equipped: boolean; level: number; nextCost: number | null };
const skins = (patch: { balance?: number; equipped?: string; items?: Partial<Record<string, Partial<Item>>> } = {}) => {
  const equipped = patch.equipped ?? "default";
  const items: Item[] = ["default", "desert", "arctic", "neon"].map((id) => ({
    id,
    unlock: id === "default" ? "default" : "free",
    owned: true,
    equipped: id === equipped,
    level: 1,
    nextCost: 100_000,
    ...(patch.items?.[id] ?? {}),
  }));
  return { code: "SUCCESS", message: "", data: { equipped: { id: equipped, level: 1 }, points: { earned: 0, spent: 0, balance: patch.balance ?? 150_000 }, maxLevel: 5, levelCosts: [100_000, 200_000, 700_000, 2_000_000], items } };
};
const login = () => {
  session.value = { data: { user: { accessToken: "tok" } }, status: "authenticated" };
};

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
});
beforeEach(() => Object.values(svc).forEach((f) => f.mockReset()));
afterEach(() => {
  cleanup();
  session.value = { data: null, status: "unauthenticated" };
});

describe("탱크 스킨 화면 (F7)", () => {
  it("게스트 — 부르지 않고 로그인 안내 + 레벨 미리보기(스킨 고르기)", () => {
    render(<FortressSkinsView />);
    expect(svc.getMyFortressSkins).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "카카오로 로그인" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "네온 라인" }));
    expect(screen.getByRole("button", { name: "네온 라인" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("로그인 — 장착 중 스킨을 고른 채 보이고, 다른 스킨 장착은 PUT 응답으로 바꿔 끼운다", async () => {
    login();
    svc.getMyFortressSkins.mockResolvedValue(skins());
    svc.equipFortressSkin.mockResolvedValue(skins({ equipped: "neon" }));
    await act(async () => {
      render(<FortressSkinsView />);
    });
    expect(screen.getByTestId("fortress-skin-points").textContent).toContain("150,000 P");
    expect(screen.getByTestId("fortress-skin-default").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("fortress-skin-neon"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("fortress-skin-equip"));
    });
    expect(svc.equipFortressSkin).toHaveBeenCalledWith("neon", "tok");
    expect(screen.getByTestId("fortress-skin-neon").textContent).toContain("장착 중");
  });

  it("강화 — 같은 자리 확인 단계를 거쳐 목표 레벨(지금+1)로 POST, 포인트가 모자라면 막는다", async () => {
    login();
    svc.getMyFortressSkins.mockResolvedValue(skins({ balance: 50_000 }));
    await act(async () => {
      render(<FortressSkinsView />);
    });
    fireEvent.click(screen.getByTestId("fortress-skin-upgrade"));
    expect(screen.getByText(/50,000 P 더 필요해요/)).toBeTruthy();
    // 막아도 disabled가 아니라 aria-disabled — 포커스는 취소 버튼, 눌러도 요청하지 않는다
    const confirm = screen.getByTestId("fortress-skin-upgrade-confirm") as HTMLButtonElement;
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    expect(confirm.disabled).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "취소" }));
    fireEvent.click(confirm);
    expect(svc.upgradeFortressSkin).not.toHaveBeenCalled();
    // Esc로 닫으면 포커스는 다시 강화 버튼으로
    await act(async () => {
      fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(screen.queryByTestId("fortress-skin-upgrade-confirm")).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId("fortress-skin-upgrade"));
    cleanup();

    svc.getMyFortressSkins.mockResolvedValue(skins());
    svc.upgradeFortressSkin.mockResolvedValue(skins({ items: { default: { level: 2, nextCost: 200_000 } } }));
    await act(async () => {
      render(<FortressSkinsView />);
    });
    fireEvent.click(screen.getByTestId("fortress-skin-upgrade"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("fortress-skin-upgrade-confirm"));
    });
    expect(svc.upgradeFortressSkin).toHaveBeenCalledWith({ skinId: "default", level: 2 }, "tok");
    expect(screen.getByTestId("fortress-skin-upgrade").textContent).toContain("Lv3로 강화");
  });

  it("강화 요청 중에는 취소·Esc로 닫히지 않고, 응답이 오면 닫히며 포커스는 강화 버튼으로", async () => {
    login();
    let finish!: (v: unknown) => void;
    svc.getMyFortressSkins.mockResolvedValue(skins());
    svc.upgradeFortressSkin.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    await act(async () => {
      render(<FortressSkinsView />);
    });
    fireEvent.click(screen.getByTestId("fortress-skin-upgrade"));
    fireEvent.click(screen.getByTestId("fortress-skin-upgrade-confirm"));
    const cancel = screen.getByRole("button", { name: "취소" });
    expect(cancel.getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(screen.getByTestId("fortress-skin-upgrade-confirm"), { key: "Escape" });
    fireEvent.click(cancel);
    expect(screen.getByTestId("fortress-skin-upgrade-confirm")).toBeTruthy();
    await act(async () => {
      finish(skins({ items: { default: { level: 2, nextCost: 200_000 } } }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(screen.queryByTestId("fortress-skin-upgrade-confirm")).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId("fortress-skin-upgrade"));
    // 남은 포커스 복원 표시가 없다 — 확인 단계를 다시 열고 다른 카드를 누르면 포커스는 그 카드에 남는다
    fireEvent.click(screen.getByTestId("fortress-skin-upgrade"));
    const card = screen.getByTestId("fortress-skin-desert");
    card.focus();
    await act(async () => {
      fireEvent.click(card);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(document.activeElement).toBe(card);
  });

  it("강화 409(레벨 어긋남)면 코드별 문구로 알리고 확인 단계를 닫은 채 조용히 다시 맞춘다(고른 스킨 유지)", async () => {
    const toast = (await import("react-hot-toast")).default;
    login();
    svc.getMyFortressSkins.mockResolvedValueOnce(skins()).mockResolvedValueOnce(skins({ items: { neon: { level: 3, nextCost: 700_000 } } }));
    svc.upgradeFortressSkin.mockRejectedValueOnce(new ApiError("USER_SKIN_LEVEL_MISMATCH", "level mismatch", 409));
    await act(async () => {
      render(<FortressSkinsView />);
    });
    fireEvent.click(screen.getByTestId("fortress-skin-neon"));
    fireEvent.click(screen.getByTestId("fortress-skin-upgrade"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("fortress-skin-upgrade-confirm"));
    });
    expect(toast.error).toHaveBeenCalledWith("레벨이 다른 곳에서 바뀌었어요. 최신 상태로 다시 불러올게요.");
    expect(svc.getMyFortressSkins).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("fortress-skin-upgrade-confirm")).toBeNull();
    expect(screen.getByTestId("fortress-skin-neon").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("fortress-skin-upgrade").textContent).toContain("Lv4로 강화");
  });

  it("만렙이면 강화 버튼 대신 '최고 레벨', 불러오기 401이면 다시 로그인", async () => {
    login();
    svc.getMyFortressSkins.mockResolvedValue(skins({ items: { default: { level: 5, nextCost: null } } }));
    await act(async () => {
      render(<FortressSkinsView />);
    });
    expect(screen.queryByTestId("fortress-skin-upgrade")).toBeNull();
    expect(screen.getByText("최고 레벨이에요")).toBeTruthy();
    cleanup();

    svc.getMyFortressSkins.mockRejectedValueOnce(new ApiError("AUTH_UNAUTHORIZED", "만료", 401));
    await act(async () => {
      render(<FortressSkinsView />);
    });
    expect(screen.getByRole("alert").textContent).toContain("로그인이 만료");
  });
});
