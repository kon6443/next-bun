/** 움직임 줄이기(OS 설정) — 서버·matchMedia 없는 환경에서는 false */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** 매 프레임 읽을 때는 이 객체의 matches를 본다(매번 matchMedia를 새로 만들지 않게) */
export function reducedMotionQuery(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(REDUCED_MOTION_QUERY) : null;
}

export function prefersReducedMotion(): boolean {
  return reducedMotionQuery()?.matches === true;
}
