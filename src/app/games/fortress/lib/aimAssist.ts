/**
 * 조준 보조 (순수, D-022) — 예상 궤적 앞부분 · 지난 발 기록
 * 궤적은 엔진 applyAction(실제 발사와 같은 탄도 코드·바람)을 확정하지 않고 돌려 첫 탄의 샘플만 쓴다(previewShot은 착탄점만 주므로)
 * 착탄점이 드러나지 않게 비행의 앞 1/3만 보여 준다
 */

import { type Action, type MatchEvent, type MatchState, applyAction } from "../engine";

/** 예상 궤적으로 보여 줄 비행 비율 */
export const AIM_PATH_FRACTION = 1 / 3;

type FireAction = Extract<Action, { kind: "fire" }>;

/** 첫 탄 비행 샘플의 앞 1/3 — [x0, y0, x1, y1, …]. 쏠 수 없는 입력이면 null */
export function aimPath(state: MatchState, input: FireAction): number[] | null {
  if (input.power <= 0) return null;
  const r = applyAction(state, input);
  if (!r.ok) return null;
  const shot = firstShot(r.events);
  if (!shot) return null;
  const points = shot.samples.length / 2;
  const shown = Math.max(2, Math.ceil(points * AIM_PATH_FRACTION));
  return shot.samples.slice(0, Math.min(points, shown) * 2);
}

function firstShot(events: readonly MatchEvent[]): Extract<MatchEvent, { type: "shot" }> | null {
  let best: Extract<MatchEvent, { type: "shot" }> | null = null;
  for (const e of events) if (e.type === "shot" && (!best || e.t < best.t || (e.t === best.t && e.projectileId < best.projectileId))) best = e;
  return best;
}

/** 지난 발 — 각도·파워와 첫 착탄점(맵 밖으로 나갔으면 null) */
export type LastShot = { angle: number; power: number; impact: { x: number; y: number } | null };

export function lastShotOf(action: FireAction, events: readonly MatchEvent[]): LastShot {
  let impact: { x: number; y: number; t: number } | null = null;
  for (const e of events) if (e.type === "explode" && (!impact || e.t < impact.t)) impact = { x: e.x, y: e.y, t: e.t };
  return { angle: action.angle, power: action.power, impact: impact ? { x: impact.x, y: impact.y } : null };
}
