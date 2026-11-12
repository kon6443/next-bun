// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const svc = vi.hoisted(() => ({ getFortressMatch: vi.fn(), getFortressReplay: vi.fn() }));
vi.mock("@/services/fortressService", () => svc);
vi.mock("@/app/games/_shared/hooks/useKakaoReady", () => ({ useKakaoReady: () => ({ kakao: "off", kakaoScript: null }) }));
const replayProps = vi.hoisted(() => ({ last: null as null | Record<string, unknown> }));
vi.mock("../../components/FortressReplay", () => ({
  FortressReplay: (props: Record<string, unknown>) => {
    replayProps.last = props;
    return <div data-testid="replay-stub" />;
  },
}));

import { ApiError } from "@/types/api";
import { FortressMatchViewer, replayView } from "./FortressMatchViewer";

const ok = (data: unknown) => ({ code: "SUCCESS", message: "", data });
const config = { seed: 1, mapId: "hills", mode: "ffa", players: [{ slot: 0, team: 0, tankId: 0 }, { slot: 1, team: 0, tankId: 1 }] };
const match = {
  matchId: "kYDnp6WGrJZAlFGf",
  roomName: "한판",
  mode: "ffa",
  mapId: "hills",
  seed: 1,
  engineVersion: 1,
  playerCount: 2,
  turns: 12,
  result: { kind: "win", team: null },
  startedAt: "2026-11-02T01:00:00.000Z",
  endedAt: "2026-11-02T01:10:00.000Z",
  players: [
    { playerId: "a", name: "가나", slot: 0, team: null, tankId: 0, hp: 40, damage: 80, kos: 1, place: 1 },
    { playerId: "b", name: "다라", slot: 1, team: null, tankId: 1, hp: 0, damage: 20, kos: 0, place: 2 },
  ],
};
const replay = {
  matchId: match.matchId,
  engineVersion: 1,
  config,
  actions: [{ kind: "skip" }],
  slots: [
    { slot: 0, playerId: "a", name: "가나", skin: { id: "neon", level: 3 } },
    { slot: 1, playerId: "b", name: "다라", skin: { id: "gold", level: 9 } },
  ],
  stateHash: "abcd1234",
};

beforeEach(() => {
  svc.getFortressMatch.mockReset();
  svc.getFortressReplay.mockReset();
  replayProps.last = null;
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  window.sessionStorage.clear();
});

describe("저장된 경기 페이지 (F6)", () => {
  it("결과표 + 다시 보기는 서버 리플레이를 이름·스킨(모르는 id는 기본)·마지막 해시와 함께 재생", async () => {
    svc.getFortressMatch.mockResolvedValue(ok(match));
    svc.getFortressReplay.mockResolvedValue(ok(replay));
    await act(async () => {
      render(<FortressMatchViewer matchId={match.matchId} />);
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("가나님 우승");
    expect(screen.getByRole("list", { name: "순위" }).textContent).toContain("다라");
    fireEvent.click(screen.getByTestId("fortress-viewer-replay"));
    expect(screen.getByTestId("replay-stub")).toBeTruthy();
    expect(replayProps.last).toMatchObject({
      names: ["가나", "다라"],
      skins: [{ id: "neon", level: 3 }, { id: "default", level: 1 }],
      expectedHash: "abcd1234",
      closeLabel: "기록으로 돌아가기",
      data: { engineVersion: 1, config, actions: [{ kind: "skip" }] },
    });
  });

  it("리플레이만 없으면(404) 결과는 보이고 '리플레이가 없어요'", async () => {
    svc.getFortressMatch.mockResolvedValue(ok(match));
    svc.getFortressReplay.mockRejectedValueOnce(new ApiError("FORTRESS_REPLAY_NOT_FOUND", "x", 404));
    await act(async () => {
      render(<FortressMatchViewer matchId={match.matchId} />);
    });
    expect(screen.getByRole("list", { name: "순위" })).toBeTruthy();
    expect(screen.getByText("리플레이가 없어요")).toBeTruthy();
    expect(screen.queryByTestId("fortress-viewer-replay")).toBeNull();
  });

  it("경기가 없으면(404) 공개되지 않은 경기, 그 밖의 실패는 다시 시도", async () => {
    svc.getFortressMatch.mockRejectedValueOnce(new ApiError("FORTRESS_MATCH_NOT_FOUND", "x", 404));
    svc.getFortressReplay.mockResolvedValue(ok(replay));
    await act(async () => {
      render(<FortressMatchViewer matchId={match.matchId} />);
    });
    expect(screen.getByRole("alert").textContent).toContain("공개되지 않은 경기");
    cleanup();

    svc.getFortressMatch.mockRejectedValueOnce(new ApiError("INTERNAL_SERVER_ERROR", "잠시 뒤에", 500)).mockResolvedValueOnce(ok(match));
    await act(async () => {
      render(<FortressMatchViewer matchId={match.matchId} />);
    });
    expect(screen.getByRole("alert").textContent).toContain("잠시 뒤에");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    });
    expect(screen.getByRole("list", { name: "순위" })).toBeTruthy();
  });

  it("replayView — slot 순 이름·스킨, slots에 없는 자리는 P{n}·기본", () => {
    const view = replayView({ ...replay, slots: [replay.slots[1]] } as never);
    expect(view.names).toEqual(["P1", "다라"]);
    expect(view.skins).toEqual([{ id: "default", level: 1 }, { id: "default", level: 1 }]);
  });

  it("그림(보충 5): 기본은 vivid, ?look=classic이면 마운트 뒤 classic", async () => {
    svc.getFortressMatch.mockResolvedValue(ok(match));
    svc.getFortressReplay.mockResolvedValue(ok(replay));
    await act(async () => {
      render(<FortressMatchViewer matchId={match.matchId} />);
    });
    expect(screen.getByTestId("fortress-match-viewer").getAttribute("data-look")).toBe("vivid");
    // 순위는 vivid면 카드 행(솔로 vivid 결과와 같은 모양), classic이면 표
    expect(screen.getByTestId("fortress-result-cards").querySelectorAll("li").length).toBe(match.players.length);
    // 시안 결과 공통(보충 6): 승자 탱크 그림·등급 배지
    expect(screen.getByTestId("result-hero")).toBeTruthy();
    expect(screen.getAllByText(/등급/).length).toBe(match.players.length);
    expect(screen.queryByRole("table")).toBeNull();
    cleanup();
    window.history.replaceState(null, "", "/games/fortress/battle/matches/x?look=classic");
    await act(async () => {
      render(<FortressMatchViewer matchId={match.matchId} />);
    });
    expect(screen.getByTestId("fortress-match-viewer").getAttribute("data-look")).toBe("classic");
    expect(screen.getByRole("table").textContent).toContain("다라");
    expect(screen.queryByTestId("fortress-result-cards")).toBeNull();
  });
});
