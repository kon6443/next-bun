// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 승자 탱크 그림(캔버스)은 대역 — 버튼 줄만 본다
vi.mock("./TankSkinPreview", () => ({ TankSkinPreview: () => null }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null, status: "unauthenticated" }) }));
vi.mock("@/services/fortressService", () => ({ uploadFortressSoloMatch: vi.fn() }));

import { ENGINE_VERSION } from "../engine";
import golden from "../engine/__fixtures__/golden-matches.json";
import type { ReplayData } from "../lib/replay";
import { FortressResult } from "./FortressResult";

afterEach(cleanup);

const config = { seed: 3, mapId: "hills" as const, mode: "ffa" as const, players: [{ slot: 0, team: 0, tankId: 0 }, { slot: 1, team: 0, tankId: 1 }] };
const data: ReplayData = { engineVersion: ENGINE_VERSION, config, actions: [] };
const handlers = { onReplay: () => {}, onRematch: () => {}, onSetup: () => {} };

describe("AI전·같은 기기 결과 화면 — 포트리스 홈", () => {
  it("결과 화면에 다시하기·다시 보기와 함께 포트리스 홈 링크(/games/fortress)", () => {
    render(<FortressResult data={data} controllers={["human", 1]} {...handlers} />);
    expect(screen.getByTestId("fortress-rematch")).toBeTruthy();
    expect(screen.getByTestId("fortress-replay")).toBeTruthy();
    expect(screen.getByRole("link", { name: "포트리스 홈" }).getAttribute("href")).toBe("/games/fortress");
  });

  /** 골든 "ffa 2인 hills AI 중·중"(25수·진행한 턴 25) — 픽스처 순서가 아니라 이름으로 고른다 */
  const golden25 = () => {
    const g = (golden as unknown as { name: string; config: typeof config; actions: ReplayData["actions"] }[]).find((c) => c.name === "ffa 2인 hills AI 중·중");
    if (!g) throw new Error("golden");
    return g;
  };

  it("끝난 경기면 다시 보기 옆에 '기록 공유' 버튼", () => {
    const g = golden25();
    render(<FortressResult data={{ engineVersion: ENGINE_VERSION, config: g.config, actions: g.actions }} controllers={["human", 1]} {...handlers} />);
    expect(screen.getByTestId("fortress-solo-share").textContent).toBe("기록 공유");
  });

  it("머리의 턴 수는 진행한 턴(승패를 낸 턴 포함, 서버 API turns와 같다) — 골든 25수(turn.no 24) → 25턴", () => {
    const g = golden25();
    expect(g.actions.length).toBe(25);
    render(<FortressResult data={{ engineVersion: ENGINE_VERSION, config: g.config, actions: g.actions }} controllers={["human", 1]} {...handlers} />);
    expect(screen.getByTestId("fortress-result-turns").textContent).toBe("25턴");
  });

  it("행동 수와 갈리는 경기 — 남의 턴 기권 뒤 현재 턴 기권(2수, turn.no 0) → 1턴", () => {
    const g = (golden as unknown as { name: string; config: typeof config; actions: ReplayData["actions"] }[]).find((c) => c.name === "기권 남의 턴·현재 턴");
    if (!g) throw new Error("golden");
    render(<FortressResult data={{ engineVersion: ENGINE_VERSION, config: g.config, actions: g.actions }} controllers={["human", 1, 2]} {...handlers} />);
    expect(screen.getByTestId("fortress-result-turns").textContent).toBe("1턴");
  });
});
