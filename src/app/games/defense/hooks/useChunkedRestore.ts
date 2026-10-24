"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Stage } from "../engine";
import { RESTORE_CHUNK_TICKS, type RestoredGame, restoreGame, restoreGameInChunks } from "../lib/restoreGame";

/**
 * 이어하기 다시 돌리기 (games-polish FE-06) — 짧은 저장본은 바로, 긴 저장본은 틱 묶음마다 쉬며 진행률(progress 0~1)을 낸다
 * 클릭 안에서 최대 판(수 초)을 동기로 돌려 화면이 멈추던 것을 막는다. 화면을 떠나면 멈추고 "cancelled"
 */
export function useChunkedRestore() {
  const [progress, setProgress] = useState<number | null>(null);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const restore = useCallback(async (stage: Stage, seed: number, inputs: readonly number[], tick: number): Promise<RestoredGame | null | "cancelled"> => {
    if (tick <= RESTORE_CHUNK_TICKS) return restoreGame(stage, seed, inputs, tick);
    setProgress(0);
    const result = await restoreGameInChunks(stage, seed, inputs, tick, {
      onProgress: (ratio) => {
        if (aliveRef.current) setProgress(ratio);
      },
      isCancelled: () => !aliveRef.current,
    });
    if (aliveRef.current) setProgress(null);
    return result;
  }, []);

  return { progress, restore };
}
