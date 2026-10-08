Next.js 프론트엔드 변경 코드에 대해 플로우 기반 QA 리뷰를 수행합니다.

1. `review-front` 에이전트에 현재 변경분 리뷰를 맡깁니다. 범위 인자($ARGUMENTS)가 있으면 그대로 전달하고, 없으면 작업 트리의 diff를 대상으로 합니다.
2. 에이전트 보고 중 결론이 걸린 `파일:라인`과 "없다" 판정은 원본에서 다시 확인한 뒤 반영합니다.
3. 에이전트가 권고한 검증 명령을 실행합니다(`bun run lint`·`bun run typecheck`·`bun run test:run`). `bun run build`는 sandbox 안에서 판정하지 않습니다(`CLAUDE.md` Commands).
4. 에이전트의 출력 표(플로우별 검증 결과, 발견된 이슈)와 검증 결과를 보고합니다.
