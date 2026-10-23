/**
 * 받은 순간 게임 세션의 남은 시간 — 응답 expiresAt 기준(서버 TTL이 바뀌어도 따라간다, Q-T1)
 * 서버·기기 시계 차이로 길게 잡히지 않게 게임별 상한(capMs = 서버 TTL)을 두고, 읽을 수 없으면 상한
 * 이후 만료 판정은 이 값과 받은 뒤 이 기기에서 흐른 시간으로 한다
 */
export function sessionTtlMs(expiresAt: string | undefined, now: number, capMs: number): number {
  const left = expiresAt ? Date.parse(expiresAt) - now : Number.NaN;
  return Number.isFinite(left) ? Math.min(Math.max(0, left), capMs) : capMs;
}
