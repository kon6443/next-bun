import type { FortressSoloUploadRequest } from "@/services/fortressService";
import { ApiError } from "@/types/api";
import type { ShareContent } from "@/app/games/_shared/lib/shareSpec";
import { type MatchState, simulateMatch, stateHash } from "../engine";
import { buildFortressShareContent } from "../battle-ui/lib/fortressShare";
import { type Controller, playerName } from "./controllers";
import { type ReplayData, matchTurns } from "./replay";

/**
 * AI전·같은 기기 대전 공유(D-027 보충 2) — 결과 화면이 서버에 올릴 본문·받은 matchId로 공유 문구·실패 안내를 만든다
 * 서버가 기록을 다시 돌려 검증한다(같은 엔진). 이름·스킨은 서버가 정하므로 보내지 않는다(여분 필드는 422)
 */

/** 올릴 본문 — 끝나지 않았거나(중단) 엔진이 거부하는 기록, 이 기기 밖 자리(remote)가 있으면 null(공유 버튼을 숨긴다) */
export function buildSoloUpload(data: ReplayData, controllers: readonly Controller[]): FortressSoloUploadRequest | null {
  const sim = simulateMatch(data.config, data.actions);
  if (!sim.ok || sim.final.result.kind === "ongoing") return null;
  const slots: FortressSoloUploadRequest["slots"] = [];
  for (const { slot } of data.config.players) {
    const c = controllers[slot];
    // 사람 자리는 aiLevel 키를 아예 싣지 않는다(null이어도 422)
    if (c === "human") slots.push({ slot, kind: "human" });
    else if (c === 0 || c === 1 || c === 2) slots.push({ slot, kind: "ai", aiLevel: c });
    else return null;
  }
  return { engineVersion: data.engineVersion, config: data.config, actions: data.actions, stateHash: stateHash(sim.final), slots };
}

/**
 * 받은 matchId의 공유 문구 — 서버 기록 보기 페이지와 같은 문구(fortressShare). 이름은 서버 규칙과 같은 "P2 (AI 중)"(playerName)
 * 순위는 승패만 쓴다(1위 = 이긴 자리) — 머리글(우승·팀 승리·무승부)에만 쓰인다
 * 턴 수는 서버 기록 보기와 같은 진행한 턴 수 matchTurns(final)
 */
export function soloShareContent(matchId: string, final: MatchState, controllers: readonly Controller[]): ShareContent {
  const result = final.result;
  const winners = result.kind === "win" ? result.slots : [];
  const players = final.tanks
    .filter((t) => t !== null)
    .map((t) => ({ name: playerName(controllers, t.slot), place: winners.includes(t.slot) ? 1 : 2, team: final.mode === "team" ? (t.team as 0 | 1) : null }));
  return buildFortressShareContent({
    matchId,
    roomName: null,
    mode: final.mode,
    playerCount: players.length,
    turns: matchTurns(final),
    result: result.kind === "win" ? { kind: "win", team: result.team === undefined ? null : (result.team as 0 | 1) } : { kind: "draw", team: null },
    players,
  });
}

/** 같은 기록으로 다시 보내도 결과가 바뀌지 않는 실패 — 그 경기에서는 버튼을 막는다(스로틀만 쓰지 않게) */
export function isPermanentSoloUploadError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.code === "FORTRESS_SOLO_ENGINE_MISMATCH" || error.code === "FORTRESS_SOLO_REPLAY_INVALID" || error.code === "VALIDATION_ERROR" || error.status === 413;
}

/** 실패 안내 — code별로(백엔드 계약 D-027 보충 2) */
export function soloUploadErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "기록을 올리지 못했어요. 연결을 확인하고 다시 눌러 주세요.";
  // 로그인 토큰(쿠키 포함)이 만료돼 토큰 없이 다시 보내도 401 — 다시 로그인해야 풀린다
  if (error.status === 401) return "로그인이 만료됐어요. 다시 로그인한 뒤 눌러 주세요.";
  switch (error.code) {
    case "FORTRESS_SOLO_ENGINE_MISMATCH":
      return "게임이 새 버전으로 바뀌었어요. 새로 고친 뒤 다시 해 주세요.";
    case "FORTRESS_SOLO_REPLAY_INVALID":
    case "VALIDATION_ERROR":
      return "이 경기 기록을 확인하지 못해 공유할 수 없어요.";
    case "TOO_MANY_REQUESTS":
      return "잠시 후 다시 눌러 주세요.";
  }
  if (error.status === 413) return "기록이 너무 길어 공유할 수 없어요.";
  if (error.status === 429) return "잠시 후 다시 눌러 주세요.";
  // 그 밖의 서버 오류 — 서버 문구(영어·내부 문구일 수 있다) 대신 고정 안내
  return "기록을 올리지 못했어요. 잠시 후 다시 눌러 주세요.";
}
