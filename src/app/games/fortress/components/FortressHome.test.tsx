// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

// 로비 채팅 카드는 소켓을 연다 — 자리만(카드 자체는 FortressHomeLobbyChat.test)
vi.mock("../battle-ui/components/FortressHomeLobbyChat", () => ({ FortressHomeLobbyChat: () => <section aria-label="로비 채팅" data-testid="home-lobby-chat" /> }));
// 내 스킨 버튼은 로그인·스킨 조회를 한다 — 자리만(버튼 자체는 FortressMySkinButton.test)
vi.mock("./FortressMySkinButton", () => ({ FortressMySkinButton: () => <a href="/games/fortress/skins" data-testid="fortress-my-skin" aria-label="내 스킨" /> }));

import { FortressHome } from "./FortressHome";

afterEach(cleanup);

describe("포트리스 홈 (F8, D-018)", () => {
  it("플레이 진입 — AI와 대전(?vs=ai) · 같은 기기 대전(?vs=local) · 온라인(로비·방 만들기·코드 입력)", () => {
    render(<FortressHome />);
    expect(screen.getByRole("heading", { level: 1, name: "포트리스" })).toBeInTheDocument();
    // 내 스킨(D-025) — 머리(제목 줄) 안 오른쪽 위
    expect(screen.getByRole("heading", { level: 1, name: "포트리스" }).closest("header")).toContainElement(screen.getByTestId("fortress-my-skin"));
    const play = within(screen.getByRole("region", { name: "플레이" }));
    expect(play.getByRole("link", { name: /AI와 대전/ })).toHaveAttribute("href", "/games/fortress/play?vs=ai");
    expect(play.getByRole("link", { name: /같은 기기 대전/ })).toHaveAttribute("href", "/games/fortress/play?vs=local");
    const online = within(screen.getByRole("region", { name: /친구와 온라인 대전/ }));
    expect(online.getByRole("link", { name: /방 목록/ })).toHaveAttribute("href", "/games/fortress/battle");
    expect(online.getByRole("link", { name: "방 만들기" })).toHaveAttribute("href", "/games/fortress/battle#battle-create");
    expect(online.getByRole("link", { name: "코드로 참가" })).toHaveAttribute("href", "/games/fortress/battle#battle-room-code");
    expect(screen.getByRole("link", { name: "게임 목록" })).toHaveAttribute("href", "/games");
    // 로비 채팅 카드 — 플레이 바로 아래, 온라인 대전 위(테트리스 홈과 같은 자리)
    const chat = screen.getByTestId("home-lobby-chat");
    expect(screen.getByRole("region", { name: "플레이" }).compareDocumentPosition(chat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chat.compareDocumentPosition(screen.getByRole("region", { name: /친구와 온라인 대전/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("조작 방법은 접혀 있다가 요약을 누르면 펼쳐진다(발사 버튼 표기)", () => {
    render(<FortressHome />);
    const details = screen.getByTestId("fortress-guide-details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.click(within(details).getByText("조작 방법"));
    expect(details.open).toBe(true);
    expect(within(details).getByText("발사 버튼")).toBeInTheDocument();
    expect(within(details).queryByText("발사 N")).toBeNull();
  });

  it("탱크 3종 — 이름·HP·연료", () => {
    render(<FortressHome />);
    const tanks = within(screen.getByRole("region", { name: "탱크" }));
    expect(tanks.getAllByRole("listitem")).toHaveLength(3);
    expect(tanks.getByText("캐논")).toBeInTheDocument();
    expect(tanks.getByText("HP 120 · 연료 100")).toBeInTheDocument();
  });
});
