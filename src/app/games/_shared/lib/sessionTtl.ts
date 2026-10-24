/**
 * 받은 순간 게임 세션의 남은 시간 — 이후 만료 판정은 이 값과 받은 뒤 이 기기에서 흐른 시간으로 한다
 * 1) 응답 ttlSeconds(서버가 준 유효 시간) — 기기 시계와 무관하다(시계가 빨라도 줄지 않는다)
 * 2) 없으면(ttlSeconds 배포 전 서버) 응답 expiresAt − 기기 시각 (Q-T1)
 * 어느 쪽이든 게임별 상한(capMs = 서버 TTL)을 넘지 않게, 읽을 수 없으면 상한
 */
export function sessionTtlMs(session: { expiresAt?: string; ttlSeconds?: number }, now: number, capMs: number): number {
  const { ttlSeconds, expiresAt } = session;
  const left =
    typeof ttlSeconds === 'number' && Number.isFinite(ttlSeconds) && ttlSeconds > 0
      ? ttlSeconds * 1000
      : expiresAt
        ? Date.parse(expiresAt) - now
        : Number.NaN;
  return Number.isFinite(left) ? Math.min(Math.max(0, left), capMs) : capMs;
}
