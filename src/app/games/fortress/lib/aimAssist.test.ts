import { describe, it, expect } from "vitest";
import { type MatchState, applyAction, createMatch } from "../engine";
import { AIM_PATH_FRACTION, aimPath, lastShotOf } from "./aimAssist";

function match(): MatchState {
  const r = createMatch({ seed: 7, mapId: "hills", mode: "ffa", players: [{ slot: 0, team: 0, tankId: 0 }, { slot: 1, team: 0, tankId: 1 }] });
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

describe("조준 보조 — 예상 궤적 앞 1/3 · 지난 발", () => {
  it.each([[45, 80], [70, 60], [30, 100]])("각도 %i° 파워 %i — 실제 첫 탄 비행의 앞 1/3만, 같은 좌표(바람 포함)", (angle, power) => {
    const s = match();
    const turnNo = s.turn.no;
    const input = { kind: "fire" as const, move: 0, angle, power, weaponId: 0 };
    const real = applyAction(s, input);
    if (!real.ok) throw new Error(real.reason);
    const shot = real.events.find((e) => e.type === "shot");
    if (!shot || shot.type !== "shot") throw new Error("no shot");
    const path = aimPath(s, input);
    expect(path).not.toBeNull();
    const points = shot.samples.length / 2;
    expect(path!.length / 2).toBe(Math.ceil(points * AIM_PATH_FRACTION));
    expect(path).toEqual(shot.samples.slice(0, path!.length));
    // 착탄점(마지막 샘플)은 들어 있지 않다
    expect(path!.length).toBeLessThan(shot.samples.length);
    // 확정하지 않는다 — 원래 state는 그대로
    expect(s.turn.no).toBe(turnNo);
  });

  it("넘기기(파워 0)·쏠 수 없는 입력은 궤적 없음", () => {
    const s = match();
    expect(aimPath(s, { kind: "fire", move: 0, angle: 45, power: 0, weaponId: 0 })).toBeNull();
    expect(aimPath(s, { kind: "fire", move: 0, angle: 45, power: 60, weaponId: 99 })).toBeNull();
  });

  it("지난 발 — 각도·파워와 첫 폭발 자리, 맵 밖이면 착탄점 없음", () => {
    expect(lastShotOf({ kind: "fire", move: 0, angle: 50, power: 70, weaponId: 0 }, [
      { type: "shot", t: 0, projectileId: 0, samples: [0, 0, 10, 10], end: "explode" },
      { type: "explode", t: 9, x: 400, y: 600, r: 30 },
      { type: "explode", t: 4, x: 300, y: 650, r: 30 },
    ])).toEqual({ angle: 50, power: 70, impact: { x: 300, y: 650 } });
    expect(lastShotOf({ kind: "fire", move: 0, angle: 50, power: 100, weaponId: 0 }, [{ type: "shot", t: 0, projectileId: 0, samples: [0, 0], end: "out" }]).impact).toBeNull();
  });
});
