import { afterEach, describe, expect, it, vi } from "vitest";

const backendFetch = vi.hoisted(() => vi.fn());
vi.mock("./FetchService", () => ({ default: { backendFetch } }));

const { uploadFortressSoloMatch } = await import("./fortressService");

const body = { engineVersion: 2, config: { seed: 1, mapId: "hills" as const, mode: "ffa" as const, players: [] }, actions: [], stateHash: "0123abcd", slots: [] };
const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  backendFetch.mockReset();
  vi.useRealTimers();
});

describe("uploadFortressSoloMatch — POST /api/v1/fortress/solo-matches", () => {
  it("본문 그대로 보내고 matchId를 돌려준다(게스트는 토큰 없이)", async () => {
    backendFetch.mockResolvedValue(json(201, { code: "SUCCESS", data: { matchId: "AbCdEfGhIjKlMnOp" } }));
    const res = await uploadFortressSoloMatch(body);
    expect(res.data.matchId).toBe("AbCdEfGhIjKlMnOp");
    const args = backendFetch.mock.calls[0][0];
    expect(args).toMatchObject({ method: "POST", endpoint: "/api/v1/fortress/solo-matches", body });
    expect(args.accessToken).toBeUndefined();
  });

  it("로그인 토큰이 무효(401)면 전역 로그아웃 없이 토큰을 빼고 1회 다시 보낸다", async () => {
    vi.useFakeTimers();
    backendFetch.mockResolvedValueOnce(json(401, { code: "UNAUTHORIZED", message: "x" })).mockResolvedValueOnce(json(201, { code: "SUCCESS", data: { matchId: "AbCdEfGhIjKlMnOp" } }));
    const p = uploadFortressSoloMatch(body, "expired");
    await vi.advanceTimersByTimeAsync(1200);
    await expect(p).resolves.toMatchObject({ data: { matchId: "AbCdEfGhIjKlMnOp" } });
    expect(backendFetch.mock.calls[0][0]).toMatchObject({ accessToken: "expired", notifyUnauthorized: false });
    expect(backendFetch.mock.calls[1][0].accessToken).toBeUndefined();
  });

  it("에러는 백엔드 code 그대로 ApiError(엔진 버전 다름 409·검증 실패 422 details)", async () => {
    backendFetch.mockResolvedValueOnce(json(409, { code: "FORTRESS_SOLO_ENGINE_MISMATCH", message: "engine" }));
    await expect(uploadFortressSoloMatch(body)).rejects.toMatchObject({ code: "FORTRESS_SOLO_ENGINE_MISMATCH", status: 409 });
    backendFetch.mockResolvedValueOnce(json(422, { code: "FORTRESS_SOLO_REPLAY_INVALID", message: "bad", details: { reason: "HASH" } }));
    await expect(uploadFortressSoloMatch(body)).rejects.toMatchObject({ code: "FORTRESS_SOLO_REPLAY_INVALID", status: 422, details: { reason: "HASH" } });
    backendFetch.mockResolvedValueOnce(new Response("", { status: 413 }));
    await expect(uploadFortressSoloMatch(body)).rejects.toMatchObject({ status: 413, message: "기록이 너무 길어 공유할 수 없어요." });
  });
});
