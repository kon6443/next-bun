/**
 * /games/defense/dev 측정 화면 노출 — 운영 빌드에서는 notFound (D-020)
 * 실기기 측정은 로컬 개발 서버(pnpm dev, 같은 네트워크)로 한다. 운영 빌드 성능으로 재려면 로컬에서만
 * NEXT_PUBLIC_DEFENSE_DEV=1로 빌드한다(배포 파이프라인은 이 값을 넣지 않는다)
 */
// process.env를 통째로 넘기지 않는다 — 클라이언트 번들에서는 process.env.X 리터럴만 치환돼 NODE_ENV가 비면 운영에서도 열린다
export function isDefenseDevEnabled(
  env: { NODE_ENV?: string; NEXT_PUBLIC_DEFENSE_DEV?: string } = {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_DEFENSE_DEV: process.env.NEXT_PUBLIC_DEFENSE_DEV,
  },
): boolean {
  return env.NODE_ENV !== 'production' || env.NEXT_PUBLIC_DEFENSE_DEV === '1';
}
