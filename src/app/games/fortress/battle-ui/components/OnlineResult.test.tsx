// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ value: { data: null as unknown, status: "unauthenticated" } }));
vi.mock("next-auth/react", () => ({ useSession: () => session.value }));
const svc = vi.hoisted(() => ({ getFortressMatch: vi.fn(), getFortressReplay: vi.fn(), getFortressMatchPoints: vi.fn() }));
vi.mock("@/services/fortressService", () => svc);
vi.mock("@/app/games/_shared/hooks/useKakaoReady", () => ({ useKakaoReady: () => ({ kakao: "off", kakaoScript: null }) }));
vi.mock("@/app/auth/useKakaoLogin", () => ({ useKakaoLogin: () => ({ start: vi.fn(), isStarting: false }) }));
// 방 소켓 컨텍스트는 결과 화면이 쓰지 않는다 — 모듈만 가볍게
vi.mock("../contexts/FortressSocketContext", () => ({ useFortressSocket: () => ({}) }));

import type { MatchEndedPayload } from "@/types/fortressSocket";
import type { MatchPublished } from "../hooks/useFortressMatchPublished";
import { OnlineResult } from "./FortressOnlineStage";
import type { Action } from "../../engine";
import type { ReplayData } from "../../lib/replay";
import { resetPointsCacheForTest } from "./FortressResultPoints";

const ok = (data: unknown) => ({ code: "SUCCESS", message: "", data });
const players = [
  { playerId: "a", name: "가나", slot: 0, team: null, tankId: 0, hp: 40, damage: 80, kos: 2, place: 1 },
  { playerId: "b", name: "다라", slot: 1, team: null, tankId: 1, hp: 0, damage: 20, kos: 0, place: 2 },
] as const;
const saved = {
  matchId: "kYDnp6WGrJZAlFGf",
  roomName: "한판",
  mode: "ffa",
  mapId: "hills",
  seed: 1,
  engineVersion: 1,
  playerCount: 2,
  turns: 12,
  result: { kind: "win", team: null },
  startedAt: "",
  endedAt: "",
  players: players.map((p) => ({ ...p })),
} as const;
const ended: MatchEndedPayload = {
  matchId: saved.matchId,
  result: { kind: "win", slots: [0] },
  players: players.map((p) => ({ playerId: p.playerId, name: p.name, slot: p.slot, team: p.team, hp: p.hp, damage: p.damage, kos: p.kos, place: p.place })),
};
const ready = { status: "ready", match: saved } as unknown as MatchPublished;
const config = { seed: 7, mapId: "hills" as const, mode: "ffa" as const, players: [{ slot: 0, team: 0, tankId: 0 }, { slot: 1, team: 0, tankId: 1 }] };
const shot = (power = 40): Action => ({ kind: "fire", move: 0, angle: 60, power, weaponId: 0 });
/** 6턴 넘게, 나(slot 0)는 3번 실제로 쏜 경기 — 적립 조건 충족 */
const eligibleReplay: ReplayData = { engineVersion: 1, config, actions: Array.from({ length: 8 }, () => shot(30)) };

function view(props: Partial<Parameters<typeof OnlineResult>[0]> = {}) {
  const onReplay = vi.fn(async () => {});
  render(<OnlineResult matchId={saved.matchId} replay={eligibleReplay} published={{ status: "waiting" }} ended={null} myPlayerId="a" isHost={false} roomStatus="RESULT" onReplay={onReplay} onRematch={() => {}} onExit={() => {}} {...props} />);
  return { onReplay };
}

beforeEach(() => {
  Object.values(svc).forEach((f) => f.mockReset());
  resetPointsCacheForTest();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  session.value = { data: null, status: "unauthenticated" };
});

describe("방 안 결과 화면 (F6·F7)", () => {
  it("matchEnded를 놓쳤어도 저장된 결과로 순위·제목을 채우고, 기록 보기(새 탭)·공유가 열린다", async () => {
    let replay!: ReturnType<typeof vi.fn>;
    await act(async () => {
      replay = view({ published: ready }).onReplay;
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("이겼어요!");
    expect(screen.getByRole("list", { name: "순위" }).textContent).toContain("다라");
    expect(screen.getByTestId("fortress-record-link").getAttribute("href")).toBe(`/games/fortress/battle/matches/${saved.matchId}`);
    expect(screen.getByTestId("fortress-record-link").getAttribute("target")).toBe("_blank");
    // 게스트 — 승리 + KO 2 → 최대 70,000 P
    expect(screen.getByTestId("fortress-points-guest").textContent).toContain("+70,000 P");
    await act(async () => {
      fireEvent.click(screen.getByTestId("fortress-replay-online"));
    });
    expect(replay).toHaveBeenCalledWith(true);
  });

  it("저장 전에는 '경기 저장 중…'(순위는 matchEnded), 다시 보기는 로컬 기록으로 — 저장 상태 안내는 늘 같은 자리", async () => {
    let replay!: ReturnType<typeof vi.fn>;
    await act(async () => {
      replay = view({ ended }).onReplay;
    });
    expect(screen.getByRole("list", { name: "순위" }).textContent).toContain("가나");
    expect(screen.getByText("경기 저장 중…")).toBeTruthy();
    const status = screen.getByText("경기를 저장하는 중이에요.");
    await act(async () => {
      fireEvent.click(screen.getByTestId("fortress-replay-online"));
    });
    expect(replay).toHaveBeenCalledWith(false);
    cleanup();
    view({ ended, published: { status: "unavailable" } });
    expect(screen.getByRole("status").textContent).toBe("이 경기는 기록 보기를 열 수 없어요.");
    expect(status.getAttribute("role")).toBe("status");
  });

  it("공개되지 않고 끝나도(unavailable) 로그인 사용자의 포인트는 1회 조회해 로딩에 머물지 않는다", async () => {
    session.value = { data: { user: { accessToken: "tok" } }, status: "authenticated" };
    svc.getFortressMatchPoints.mockResolvedValue(ok({ matchId: saved.matchId, participant: true, earned: 20_000, memo: "참가 20,000" }));
    await act(async () => {
      view({ ended, published: { status: "unavailable" } });
    });
    expect(svc.getFortressMatchPoints).toHaveBeenCalledWith(saved.matchId, "tok");
    expect(screen.getByTestId("fortress-points").textContent).toContain("+20,000 P");
  });

  it("게스트 — 적립 조건(6턴·내 차례 발사 3번·기권 없음)을 못 채운 경기면 '+N P' 대신 사유", async () => {
    // 4행동 만에 끝난 경기(6턴 미만) — 백엔드 규칙상 로그인했어도 0 P
    await act(async () => {
      view({ published: ready, replay: { ...eligibleReplay, actions: eligibleReplay.actions.slice(0, 4) } });
    });
    const guest = screen.getByTestId("fortress-points-guest").textContent ?? "";
    expect(guest).toContain("6턴 전에 끝난 경기라 로그인했어도 포인트가 없었어요.");
    expect(guest).not.toContain("+");
    expect(screen.getByRole("button", { name: "카카오로 로그인" })).toBeTruthy();
  });

  it("matchEnded도 저장 결과도 없으면 '경기가 끝났어요'·'순위를 받지 못했어요'", async () => {
    vi.useFakeTimers();
    view({ published: { status: "unavailable" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("경기가 끝났어요");
    expect(screen.getByText(/순위를 받지 못했어요/)).toBeTruthy();
  });
});
