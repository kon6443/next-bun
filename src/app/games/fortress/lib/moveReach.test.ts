import { describe, expect, it } from "vitest";
import { type MatchState, WORLD_HEIGHT, createMatch, previewShot } from "../engine";
import { moveReach } from "./moveReach";

function start(): MatchState {
  const r = createMatch({ seed: 7, mapId: "hills", mode: "ffa", players: [{ slot: 0, team: 0, tankId: 0 }, { slot: 1, team: 0, tankId: 1 }] });
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/** 차례 탱크 오른쪽 dx 칸에 오를 수 없는 벽(높이 60)을 세운 state — 엔진 규칙(MAX_CLIMB)으로 막히는 경우 */
function withWall(state: MatchState, dx: number): MatchState {
  const t = state.tanks[state.turn.slot]!;
  const cols = state.terrain.cols.map((c, x) => (x >= t.x + dx && x < t.x + dx + 6 ? [t.y - 60, WORLD_HEIGHT] : c));
  return { ...state, terrain: { cols } };
}

describe("moveReach — 실제로 갈 수 있는 거리(엔진 walk와 같다)", () => {
  it("막힌 곳이 없으면 양쪽 모두 연료만큼", () => {
    const s = start();
    const t = s.tanks[s.turn.slot]!;
    expect(moveReach(s)).toMatchObject({ left: t.fuel, right: t.fuel, leftWhy: "fuel", rightWhy: "fuel" });
  });

  it("오른쪽 벽 앞에서 멈춘다 — 그 거리로 쏘면 엔진도 같은 자리에 선다", () => {
    const s = withWall(start(), 10);
    const t = s.tanks[s.turn.slot]!;
    const reach = moveReach(s)!;
    expect(reach.right).toBe(9);
    expect(reach.rightWhy).toBe("slope");
    expect(reach.leftWhy).toBe("fuel");
    expect(reach.left).toBe(t.fuel);
    const p = previewShot(s, { kind: "fire", move: reach.right, angle: 90, power: 1, weaponId: 0 });
    expect(p.ok && p.from.x).toBe(t.x + 9);
  });

  it("월드 끝에서 멈추면 이유는 edge", () => {
    const s = start();
    const t = s.tanks[s.turn.slot]!;
    const near = { ...s, tanks: s.tanks.map((x) => (x && x.slot === t.slot ? { ...x, x: 3, y: s.terrain.cols[3][0] } : x)) };
    const reach = moveReach(near)!;
    expect(reach.left).toBeLessThan(t.fuel);
    expect(reach.leftWhy).toBe("edge");
  });

  it("더 가면 협곡에 떨어지는 쪽은 그 한 칸 앞까지 — 그 거리로 쏘면 살아 있다", () => {
    const s = start();
    const t = s.tanks[s.turn.slot]!;
    // 오른쪽 12칸부터 땅이 없는 협곡
    const cols = s.terrain.cols.map((c, x) => (x >= t.x + 12 && x < t.x + 40 ? [] : c));
    const canyon = { ...s, terrain: { cols } };
    const reach = moveReach(canyon)!;
    expect(reach.rightWhy).toBe("cliff");
    const p = previewShot(canyon, { kind: "fire", move: reach.right, angle: 90, power: 1, weaponId: 0 });
    expect(p.ok && p.from.alive).toBe(true);
    const over = previewShot(canyon, { kind: "fire", move: reach.right + 1, angle: 90, power: 1, weaponId: 0 });
    expect(over.ok && over.from.alive).toBe(false);
  });
});
