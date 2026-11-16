import { describe, expect, it } from "vitest";
import type { MatchEvent } from "../../engine";
import { frameCues } from "./frameCues";

const shot = (t: number, id: number) => ({ type: "shot", t, projectileId: id, samples: [0, 0, 1, 1], end: "hit" }) as unknown as MatchEvent;
const events: MatchEvent[] = [
  shot(0, 1),
  shot(4, 2),
  { type: "damage", t: 10, slot: 1, amount: 30 } as unknown as MatchEvent,
  { type: "death", t: 12, slot: 1 } as unknown as MatchEvent,
];

describe("frameCues — 프레임 사이에 지난 사건의 소리", () => {
  it("발사는 행동당 첫 탄 한 번만", () => {
    const a = frameCues(events, -1, 0, false, [], "split");
    expect(a).toEqual({ cues: [{ kind: "fire", weapon: "split" }], fired: true });
    // 자식탄(같은 행동의 두 번째 shot)은 다시 울리지 않는다
    expect(frameCues(events, 0, 5, a.fired, [], "split")).toEqual({ cues: [], fired: true });
  });

  it("폭발(이 프레임에 터진 것) → 피격 → 격파 순, 구간 밖 사건은 빼고", () => {
    const r = frameCues(events, 9, 12, true, [{ r: 30 }], "shell");
    expect(r.cues).toEqual([{ kind: "explode", weapon: "shell", radius: 30 }, { kind: "hit", amount: 30 }, { kind: "death" }]);
    expect(frameCues(events, 12, 20, true, [], "shell").cues).toEqual([]);
  });
});
