import { useEffect, useRef } from "react";

export type AimKeyHandlers = { down: (e: KeyboardEvent) => void; up: (e: KeyboardEvent) => void; cancel: () => void };

/**
 * 조준 키보드(데스크톱) — 핸들러는 렌더마다 최신 것을 ref로 보고, 리스너는 조준 가능할 때만 한 번 붙인다
 * 창을 떠나거나(blur) 탭이 숨으면 cancel(스페이스를 누른 채 떠나면 keyup이 오지 않는다 — 충전을 버린다)
 */
export function useAimKeys(enabled: boolean, handlers: AimKeyHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    const down = (e: KeyboardEvent) => ref.current.down(e);
    const up = (e: KeyboardEvent) => ref.current.up(e);
    const cancel = () => ref.current.cancel();
    const onVisibility = () => document.visibilityState === "hidden" && cancel();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);
}
