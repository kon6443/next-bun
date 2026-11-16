import type { AiLevel } from "../ai/chooseTurn";

/** slot별 조작 — 사람(이 기기) · 다른 기기(온라인, 서버가 행동을 알려 준다) · AI 레벨 */
export type Controller = "human" | "remote" | AiLevel;

export const AI_LABELS = ["AI 하", "AI 중", "AI 상"];

/** 표시 이름 — 서버 이름이 있으면 그것, 없으면 P1·P2(AI면 난이도를 붙인다) */
export function playerName(controllers: readonly Controller[], slot: number, names?: readonly string[]): string {
  const named = names?.[slot];
  if (named) return named;
  const c = controllers[slot];
  return `P${slot + 1}${c === "human" || c === "remote" ? "" : ` (${AI_LABELS[c]})`}`;
}
