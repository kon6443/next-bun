"use client";

import { useSyncExternalStore } from "react";
import { isReducedEffects, subscribeReducedEffects } from "../lib/effectsSettings";

/** 서버 렌더에서는 연출을 줄이지 않은 것으로 본다 — 캔버스는 클라이언트에서만 그린다 */
const getServerSnapshot = () => false;

/** 지금 연출을 줄여야 하는지 — 설정·기기 설정이 바뀌면 다시 그린다 */
export function useReducedEffects(): boolean {
  return useSyncExternalStore(subscribeReducedEffects, isReducedEffects, getServerSnapshot);
}
