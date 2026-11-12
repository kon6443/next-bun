// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ value: { data: null as unknown, status: "unauthenticated" } }));
vi.mock("next-auth/react", () => ({ useSession: () => session.value }));
const svc = vi.hoisted(() => ({ getMyFortressSkins: vi.fn() }));
vi.mock("@/services/fortressService", () => svc);
// 그림(동적 import 캔버스)은 대역 — 받은 스킨만 글로
vi.mock("next/dynamic", () => ({ default: () => (p: { tanks: { skin: { id: string; level: number } }[] }) => <i data-testid="preview">{`${p.tanks[0].skin.id}:${p.tanks[0].skin.level}`}</i> }));

import { FortressMySkinButton } from "./FortressMySkinButton";

const login = () => {
  session.value = { data: { user: { accessToken: "tok" } }, status: "authenticated" };
};

afterEach(() => {
  cleanup();
  session.value = { data: null, status: "unauthenticated" };
});

describe("홈 내 스킨 버튼 (D-025)", () => {
  it("로그인하면 장착 탱크를 작게 그리고, 접근 이름에 스킨·레벨, 레벨 배지 — 스킨 화면으로", async () => {
    login();
    svc.getMyFortressSkins.mockResolvedValueOnce({ code: "SUCCESS", message: "", data: { equipped: { id: "neon", level: 3 } } });
    await act(async () => {
      render(<FortressMySkinButton />);
    });
    const link = screen.getByRole("link", { name: "내 스킨 · 네온 라인 Lv3" });
    expect(link).toHaveAttribute("href", "/games/fortress/skins");
    expect(screen.getByTestId("preview")).toHaveTextContent("neon:3");
    expect(link).toHaveTextContent("Lv3");
  });

  it("게스트는 기본 탱크·로그인 안내 이름, 배지 없음", () => {
    render(<FortressMySkinButton />);
    const link = screen.getByRole("link", { name: "내 스킨 · 로그인하고 탱크 꾸미기" });
    expect(screen.getByTestId("preview")).toHaveTextContent("default:1");
    expect(link).not.toHaveTextContent("Lv");
  });

  it("불러오기 실패는 기본 탱크", async () => {
    login();
    svc.getMyFortressSkins.mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      render(<FortressMySkinButton />);
    });
    expect(screen.getByRole("link", { name: "내 스킨" })).toBeInTheDocument();
    expect(screen.getByTestId("preview")).toHaveTextContent("default:1");
  });
});
