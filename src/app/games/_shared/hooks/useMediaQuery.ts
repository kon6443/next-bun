"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * 미디어 질의 구독 (games-polish FE-55) — 화면들이 matchMedia 구독 effect를 따로 두던 것을 하나로
 * 서버 렌더·하이드레이션은 false(전과 같다). 클라이언트 이동은 첫 렌더부터 실제 값이라 터치 기기에서 키보드 안내가 깜빡이지 않는다
 * matchMedia가 없는 환경(jsdom 등)은 false
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => (typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false), [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
