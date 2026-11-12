/**
 * 포트리스 포인트 (F7, DESIGN §13 D-006) — 적립 계산은 서버(감쇠·일일 상한·유효 경기 조건)
 * 여기는 표기와 게스트 "로그인했다면" 안내용 — 서버 API 없이 프론트 상수와 이 경기 행동 기록으로 센다
 */

import { type Action, type MatchConfig, type MatchState, applyAction, createMatch } from "../engine";

export const POINTS_PARTICIPATE = 20_000;
export const POINTS_WIN = 30_000;
export const POINTS_PER_KO = 10_000;
export const POINTS_MAX_KOS = 3;

/** 포인트 표기 — 정수·천 단위 쉼표·" P"(음수는 0). 테트리스 formatPoints와 같은 모양 */
export const formatPoints = (points: number) => `${Math.max(0, Math.floor(points)).toLocaleString("ko-KR")} P`;

/**
 * 게스트가 로그인했다면 받았을 최대 포인트 — 참가 + 승리 + KO(최대 3)
 * 유효 경기 조건은 pointsEligibility로 따로 본다. 감쇠·일일 상한은 모르므로 화면은 "최대"로 말한다
 */
export function maxPointsIfLoggedIn({ won, kos }: { won: boolean; kos: number }): number {
  return POINTS_PARTICIPATE + (won ? POINTS_WIN : 0) + Math.min(POINTS_MAX_KOS, Math.max(0, Math.floor(kos))) * POINTS_PER_KO;
}

/** 유효 경기 조건 — 백엔드 fortress-points.rules.ts(minTurns 6 · minRealShots 3)와 같은 값 */
export const POINTS_MIN_TURNS = 6;
export const POINTS_MIN_REAL_SHOTS = 3;

/** 끝난 턴 수 — 엔진은 승패를 낸 턴에서 turn.no를 올리지 않고 끝내므로 그 턴을 더한다(턴 상한이면 그대로). 백엔드 playedTurns와 같다 */
export function playedTurns(state: Pick<MatchState, "turn" | "maxTurns">): number {
  return state.turn.no >= state.maxTurns ? state.turn.no : state.turn.no + 1;
}

export type PointsEligibility = { eligible: true } | { eligible: false; reason: "turns" | "shots" | "resign" };

/**
 * 이 경기가 slot에게 적립 대상이었는지 — 백엔드와 같은 규칙으로 행동 기록을 다시 적용해 센다
 * - 경기 조건: 끝난 턴 수 ≥ 6 · 개인 조건: 내 차례 실제 발사(파워 ≥ 1 fire) ≥ 3, 내 기권(resign) 없음
 * - 쏜 사람 = 행동을 적용하기 직전 state의 turn.slot. 재적용이 실패하면 발사·턴은 거기까지만 센다(백엔드와 같다)
 * - 기권은 행동 기록 전체에서 본다(백엔드 fortress-result.service resigned 집합과 같다)
 */
export function pointsEligibility(config: MatchConfig, actions: readonly Action[], slot: number): PointsEligibility {
  const created = createMatch(config);
  if (!created.ok) return { eligible: false, reason: "turns" };
  let state = created.state;
  let realShots = 0;
  const resigned = actions.some((a) => a.kind === "resign" && a.slot === slot);
  for (const action of actions) {
    const actor = state.turn.slot;
    const r = applyAction(state, action);
    if (!r.ok) break;
    if (action.kind === "fire" && action.power >= 1 && actor === slot) realShots += 1;
    state = r.state;
  }
  if (playedTurns(state) < POINTS_MIN_TURNS) return { eligible: false, reason: "turns" };
  if (resigned) return { eligible: false, reason: "resign" };
  if (realShots < POINTS_MIN_REAL_SHOTS) return { eligible: false, reason: "shots" };
  return { eligible: true };
}
