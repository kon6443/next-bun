import { describe, expect, it } from "vitest";
import { ApiError } from "@/types/api";
import { ENGINE_VERSION, type MatchConfig, type Action, simulateMatch, stateHash } from "../engine";
import golden from "../engine/__fixtures__/golden-matches.json";
import { buildSoloUpload, isPermanentSoloUploadError, soloShareContent, soloUploadErrorMessage } from "./soloUpload";

/** 골든 "ffa 2인 hills AI 중·중"(25수, turn.no 24) — 픽스처 순서가 아니라 이름으로 고른다 */
const g = (golden as unknown as { name: string; config: MatchConfig; actions: Action[] }[]).find((c) => c.name === "ffa 2인 hills AI 중·중") ?? (() => {
  throw new Error("golden");
})();
const data = { engineVersion: ENGINE_VERSION, config: g.config, actions: g.actions };

describe("buildSoloUpload — 백엔드 계약(D-027 보충 2) 그대로의 본문", () => {
  it("필드는 engineVersion·config·actions·stateHash·slots뿐(이름·스킨 없음), stateHash는 마지막 state의 소문자 hex 8자", () => {
    const body = buildSoloUpload(data, ["human", 1])!;
    expect(Object.keys(body).sort()).toEqual(["actions", "config", "engineVersion", "slots", "stateHash"]);
    const sim = simulateMatch(g.config, g.actions);
    if (!sim.ok) throw new Error("골든 경기 재생 실패");
    expect(body.stateHash).toBe(stateHash(sim.final));
    expect(body.stateHash).toMatch(/^[0-9a-f]{8}$/);
    expect(body.actions).toBe(g.actions);
  });

  it("사람 자리는 aiLevel 키를 아예 싣지 않고, AI 자리는 aiLevel 0|1|2 — slot은 config.players 순서 그대로", () => {
    const body = buildSoloUpload(data, ["human", 2])!;
    expect(body.slots).toEqual([{ slot: 0, kind: "human" }, { slot: 1, kind: "ai", aiLevel: 2 }]);
    expect("aiLevel" in body.slots[0]).toBe(false);
    expect(JSON.stringify(body.slots[0])).toBe('{"slot":0,"kind":"human"}');
    expect(buildSoloUpload(data, ["human", "human"])!.slots.every((s) => !("aiLevel" in s))).toBe(true);
  });

  it("올릴 수 없는 기록은 null — 끝나지 않은 경기·엔진이 거부하는 기록·이 기기 밖 자리(remote)", () => {
    expect(buildSoloUpload({ ...data, actions: g.actions.slice(0, 2) }, ["human", 1])).toBeNull();
    expect(buildSoloUpload({ ...data, actions: [{ kind: "fire", move: 0, angle: 999, power: 50, weaponId: 0 } as Action] }, ["human", 1])).toBeNull();
    expect(buildSoloUpload(data, ["human", "remote"])).toBeNull();
  });
});

describe("soloShareContent — 기록 보기와 같은 공유 문구", () => {
  it("링크는 /games/fortress/battle/matches/:matchId, 이긴 자리 이름(서버 규칙과 같은 P2 (AI 중))이 머리글", () => {
    const sim = simulateMatch(g.config, g.actions);
    if (!sim.ok || sim.final.result.kind !== "win") throw new Error("골든 경기는 승패가 나야 한다");
    const c = soloShareContent("AbCdEfGhIjKlMnOp", sim.final, ["human", 1]);
    expect(c.url).toMatch(/\/games\/fortress\/battle\/matches\/AbCdEfGhIjKlMnOp$/);
    const winner = sim.final.result.slots[0];
    expect(c.title).toBe(winner === 0 ? "P1님 우승" : "P2 (AI 중)님 우승");
    expect(c.text).toContain("2인 개인전");
    // 턴 수는 서버 기록 보기와 같은 진행한 턴 — 승패를 낸 턴까지(골든 25수: turn.no 24 → 25턴)
    expect(sim.final.turn.no).toBe(24);
    expect(c.text).toContain("25턴");
  });

  it("턴 수는 행동 수가 아니다 — 남의 턴 기권 뒤 현재 턴 기권(2수, turn.no 0) → 1턴", () => {
    const r = (golden as unknown as { name: string; config: MatchConfig; actions: Action[] }[]).find((c) => c.name === "기권 남의 턴·현재 턴");
    if (!r) throw new Error("golden");
    const sim = simulateMatch(r.config, r.actions);
    if (!sim.ok || sim.final.result.kind !== "win") throw new Error("not finished");
    expect(sim.final.turn.no).toBe(0);
    expect(soloShareContent("AbCdEfGhIjKlMnOp", sim.final, ["human", 1, 2]).text).toContain("· 1턴");
  });
});

describe("soloUploadErrorMessage — code별 안내", () => {
  it.each([
    [new ApiError("FORTRESS_SOLO_ENGINE_MISMATCH", "x", 409), "새 버전"],
    [new ApiError("FORTRESS_SOLO_REPLAY_INVALID", "x", 422, undefined, { reason: "HASH" }), "확인하지 못해"],
    [new ApiError("VALIDATION_ERROR", "x", 422), "확인하지 못해"],
    [new ApiError("TOO_MANY_REQUESTS", "x", 429), "잠시 후"],
    [new ApiError("PAYLOAD_TOO_LARGE", "x", 413), "너무 길어"],
    [new TypeError("Failed to fetch"), "연결을 확인"],
    [new ApiError("UNAUTHORIZED", "x", 401), "다시 로그인"],
    [new ApiError("SOME_SERVER_ERROR", "internal stack trace", 500), "잠시 후 다시"],
  ])("%s", (error, text) => {
    expect(soloUploadErrorMessage(error)).toContain(text);
    expect(soloUploadErrorMessage(error)).not.toContain("internal");
  });

  it("다시 보내도 소용없는 실패만 영구 — 429·연결·5xx는 다시 시도", () => {
    expect(isPermanentSoloUploadError(new ApiError("FORTRESS_SOLO_ENGINE_MISMATCH", "x", 409))).toBe(true);
    expect(isPermanentSoloUploadError(new ApiError("FORTRESS_SOLO_REPLAY_INVALID", "x", 422))).toBe(true);
    expect(isPermanentSoloUploadError(new ApiError("VALIDATION_ERROR", "x", 422))).toBe(true);
    expect(isPermanentSoloUploadError(new ApiError("UNKNOWN_ERROR", "x", 413))).toBe(true);
    expect(isPermanentSoloUploadError(new ApiError("TOO_MANY_REQUESTS", "x", 429))).toBe(false);
    expect(isPermanentSoloUploadError(new ApiError("INTERNAL_SERVER_ERROR", "x", 500))).toBe(false);
    expect(isPermanentSoloUploadError(new TypeError("Failed to fetch"))).toBe(false);
  });
});
