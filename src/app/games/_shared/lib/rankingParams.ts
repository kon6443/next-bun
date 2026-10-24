/** 랭킹 ?highlight= 값 → 양의 정수 기록 id (아니면 null — 배열·0·음수·소수·문자 섞임) */
export function parseHighlightId(value: string | string[] | undefined): number | null {
  return typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : null;
}
