/** 진동 — 지원하지 않거나 막힌 기기(권한·iOS)면 조용히 무시한다 (테트리스·디펜스 공용, games-polish FE-54) */
export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // 지원하지 않으면 무시
  }
}
