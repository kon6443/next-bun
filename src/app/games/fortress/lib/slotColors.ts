import type { MatchState } from "../engine";

/** slot 색(개인전)과 팀 색(팀전) — 전장·결과·대기실·미리보기가 함께 쓴다 */
export const SLOT_COLORS = ["#38bdf8", "#f97316", "#a3e635", "#f472b6"];
export const TEAM_COLORS = ["#38bdf8", "#f97316"];

/** 팀전은 팀 색, 개인전은 slot 색 */
export function slotColor(state: MatchState, slot: number): string {
  const t = state.tanks[slot];
  return state.mode === "team" && t ? TEAM_COLORS[t.team] : SLOT_COLORS[slot];
}
