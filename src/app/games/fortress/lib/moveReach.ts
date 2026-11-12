/**
 * 이번 턴에 실제로 갈 수 있는 거리 — 엔진 previewShot(같은 walk 코드)으로 연료 끝까지 걸어 보고 멈춘 곳을 잰다
 * 엔진은 오를 수 있는 높이(MAX_CLIMB)를 넘는 비탈·벽, 월드 끝에서 멈춘다. 연료를 다 써도 그 앞에서 멈추면 남은 이동은 헛돈다
 * 조작부는 이동을 이 범위로 자르고, 끝에 닿으면 이유를 보여 준다
 */

import { type MatchState, TANKS, type Tank, WORLD_WIDTH, previewShot } from "../engine";

/** 그 방향 끝에서 멈추는 이유 — 연료를 다 씀 · 월드 끝 · 오를 수 없는 비탈·벽 · 더 가면 협곡에 떨어짐 */
export type ReachLimit = "fuel" | "edge" | "slope" | "cliff";

export type MoveReach = {
  left: number;
  right: number;
  leftWhy: ReachLimit;
  rightWhy: ReachLimit;
};

export function moveReach(state: MatchState): MoveReach | null {
  if (state.result.kind !== "ongoing") return null;
  const tank = state.tanks[state.turn.slot] as Tank | null;
  if (!tank || !tank.alive) return null;
  const weaponId = TANKS[tank.tankId].weapons[0];
  // 한쪽으로 연료 끝까지 걸어 본다 — 걷다 죽는 칸(협곡)이면 그 한 칸 앞에서 멈춘다(실수로 떨어지지 않게)
  const side = (dir: 1 | -1): { dist: number; why: ReachLimit } => {
    const p = previewShot(state, { kind: "fire", move: dir * tank.fuel, angle: 90, power: 1, weaponId });
    if (!p.ok) return { dist: 0, why: "slope" };
    const dist = Math.abs(p.from.x - tank.x);
    if (!p.from.alive) return { dist: Math.max(0, dist - 1), why: "cliff" };
    if (dist >= tank.fuel) return { dist, why: "fuel" };
    const end = tank.x + dir * dist;
    return { dist, why: end <= 0 || end >= WORLD_WIDTH - 1 ? "edge" : "slope" };
  };
  const r = side(1);
  const l = side(-1);
  return { left: l.dist, right: r.dist, leftWhy: l.why, rightWhy: r.why };
}
