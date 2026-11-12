// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { GAME_CATALOG } from "./games/_shared/lib/gameCatalog";

// 대전 입구는 열린 방 수를 서버에 묻는다 — 홈 구성만 본다
vi.mock("./games/tetris/battle-ui/components/BattleEntryLink", () => ({ BattleEntryLink: () => <a href="/games/tetris#battle">친구와 대전</a> }));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** 공개 링크는 값으로 고정한다 — 목록(GAME_CATALOG)을 잘못 고쳐도 테스트가 따라 바뀌지 않게 */
const EXPECTED_GAMES = [
  { title: "테트리스", play: "/games/tetris", secondary: ["랭킹 보기", "/games/tetris/rankings"] },
  { title: "타워 디펜스", play: "/games/defense", secondary: ["스테이지 1", "/games/defense/campaign/s1"] },
  { title: "낚시", play: "/fishing", secondary: ["물고기 도감", "/fishing/guide"] },
] as const;

describe("사이트 홈 (site-home D-002)", () => {
  it("머리 · 게임 카드(순서·링크, 대전 입구는 테트리스만) · 도구 목록", async () => {
    const { default: Home } = await import("./page");
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: "오늘은 뭐 할까요?" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "게임 전체" })).toHaveAttribute("href", "/games");

    const games = within(screen.getByRole("region", { name: "게임" }));
    expect(games.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(EXPECTED_GAMES.map((g) => g.title));
    for (const game of EXPECTED_GAMES) {
      const card = within(games.getByRole("heading", { level: 3, name: game.title }).closest("li") as HTMLElement);
      expect(card.getByRole("link", { name: `${game.title} 플레이` })).toHaveAttribute("href", game.play);
      expect(card.getByRole("link", { name: game.secondary[0] })).toHaveAttribute("href", game.secondary[1]);
      expect(card.queryByRole("link", { name: "친구와 대전" }) !== null).toBe(game.title === "테트리스");
    }

    const tools = within(screen.getByRole("region", { name: "도구" }));
    expect(tools.getByRole("link", { name: /팀 보드/ })).toHaveAttribute("href", "/teams");
    expect(tools.getByRole("link", { name: /타임 트래커/ })).toHaveAttribute("href", "/time-measurement");
  });

  it("공개 도메인이 있으면 도구 링크는 그 도메인 절대 경로(이전 홈과 같다)", async () => {
    vi.stubEnv("NEXT_PUBLIC_DOMAIN", "https://example.test/");
    const { default: Home } = await import("./page");
    render(<Home />);
    const tools = within(screen.getByRole("region", { name: "도구" }));
    expect(tools.getByRole("link", { name: /팀 보드/ })).toHaveAttribute("href", "https://example.test/teams");
    expect(tools.getByRole("link", { name: /타임 트래커/ })).toHaveAttribute("href", "https://example.test/time-measurement");
  });

  it("/games도 같은 목록을 쓴다 — 순서·플레이·보조 링크·설명", async () => {
    const { default: GamesPage } = await import("./games/page");
    render(<GamesPage />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(EXPECTED_GAMES.map((g) => g.title));
    for (const game of EXPECTED_GAMES) {
      const card = within(screen.getByRole("heading", { level: 2, name: game.title }).closest("li") as HTMLElement);
      expect(card.getByRole("link", { name: "플레이" })).toHaveAttribute("href", game.play);
      expect(card.getByRole("link", { name: game.secondary[0] })).toHaveAttribute("href", game.secondary[1]);
    }
    // 설명은 공용 목록에서 — 홈과 /games가 같은 배열을 본다
    for (const entry of GAME_CATALOG) expect(screen.getByText(entry.description)).toBeInTheDocument();
  });
});
