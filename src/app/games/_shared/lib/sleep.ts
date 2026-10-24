/** ms만큼 기다린다 — 재시도 간격 등 (games-polish FE-58: 각 파일에 흩어진 같은 한 줄을 모음) */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
