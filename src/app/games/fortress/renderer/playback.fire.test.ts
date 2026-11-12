import { describe, expect, it } from "vitest";
import { type MatchEvent, TANKS, applyAction, createMatch } from "../engine";
import { firstShotIn, playbackEnd } from "./playback";

/** tankId 탱크의 특수 무기(세 번째)를 한 번 쏜 events */
function specialShot(tankId: number): MatchEvent[] {
  const r = createMatch({ seed: 7, mapId: "hills", mode: "ffa", players: [{ slot: 0, team: 0, tankId }, { slot: 1, team: 0, tankId: 0 }] });
  if (!r.ok) throw new Error(r.reason);
  const weaponId = TANKS[tankId].weapons[2];
  const a = applyAction(r.state, { kind: "fire", move: 0, angle: 70, power: 60, weaponId });
  if (!a.ok) throw new Error(a.reason);
  return a.events;
}

/** 연출처럼 틱을 하나씩 훑으며 발사 연출을 건 횟수 */
function fireFxCount(events: MatchEvent[]): number {
  let fired = false;
  let count = 0;
  let last = -1;
  for (let tick = 0; tick <= playbackEnd(events); tick++) {
    if (firstShotIn(events, last, tick, fired)) {
      fired = true;
      count++;
    }
    last = tick;
  }
  return count;
}

describe("firstShotIn — 발사 연출은 행동마다 한 번 (D-025 B)", () => {
  it.each([
    ["분열탄(미사일)", 1],
    ["폭격(정찰)", 2],
  ])("%s — 자식탄·폭탄도 shot 이벤트지만 반동·포구 연기는 한 번", (_name, tankId) => {
    const events = specialShot(tankId);
    expect(events.filter((e) => e.type === "shot").length).toBeGreaterThan(1);
    expect(fireFxCount(events)).toBe(1);
  });

  it("처음 탄은 쏜 탱크에서 나간 shot(가장 이른 틱)", () => {
    const events = specialShot(1);
    const first = firstShotIn(events, -1, playbackEnd(events), false);
    const earliest = Math.min(...events.filter((e) => e.type === "shot").map((e) => e.t));
    expect(first?.t).toBe(earliest);
  });
});
