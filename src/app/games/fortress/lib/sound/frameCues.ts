import type { MatchEvent } from "../../engine";
import { firstShotIn } from "../../renderer/playback";
import type { FortressCue, WeaponKind } from "./recipes";

/**
 * 연출 한 프레임의 소리 신호 — afterTick 뒤 uptoTick까지 지난 사건(발사는 행동당 첫 탄 한 번, 이 프레임에 터진 폭발, 피격·격파) 순서대로
 * fired는 이 행동에서 발사 신호를 이미 냈는지 — 돌려주는 fired를 다음 프레임에 넘긴다
 */
export function frameCues(
  events: readonly MatchEvent[],
  afterTick: number,
  uptoTick: number,
  fired: boolean,
  blasts: readonly { r: number }[],
  weapon: WeaponKind,
): { cues: FortressCue[]; fired: boolean } {
  const cues: FortressCue[] = [];
  let nowFired = fired;
  if (firstShotIn(events, afterTick, uptoTick, fired)) {
    nowFired = true;
    cues.push({ kind: "fire", weapon });
  }
  for (const b of blasts) cues.push({ kind: "explode", weapon, radius: b.r });
  for (const e of events) {
    if (e.t <= afterTick || e.t > uptoTick) continue;
    if (e.type === "damage") cues.push({ kind: "hit", amount: e.amount });
    else if (e.type === "death") cues.push({ kind: "death" });
  }
  return { cues, fired: nowFired };
}
