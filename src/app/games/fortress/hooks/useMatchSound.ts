import { useCallback, useEffect } from "react";
import { fortressVibrate } from "../lib/fortressSettings";
import { getFortressSound } from "../lib/sound/player";
import type { FortressCue } from "../lib/sound/recipes";

/**
 * 경기 소리(D-025 보충 6) — 마운트 동안 경기 배경음, 연출 사건의 효과음·진동(설정·움직임 줄이기에 따라)
 * 돌려주는 onCues를 useBattleView에 넘긴다
 */
export function useMatchSound(): (cues: FortressCue[]) => void {
  useEffect(() => {
    const sound = getFortressSound();
    sound.setMusic("match");
    return () => sound.setMusic(null);
  }, []);
  return useCallback((cues: FortressCue[]) => {
    getFortressSound().playCues(cues);
    // 진동 — 큰 사건 하나만(격파 > 가장 큰 폭발)
    if (cues.some((c) => c.kind === "death")) fortressVibrate([60, 40, 90]);
    else {
      const r = Math.max(0, ...cues.map((c) => (c.kind === "explode" ? c.radius : 0)));
      if (r > 0) fortressVibrate(Math.round(12 + r * 0.45));
    }
  }, []);
}
