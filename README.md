# next-bun

Next.js 15 App Router 기반(운영 런타임 Node 24, 패키지 매니저 pnpm)의 팀 협업/태스크 관리 웹앱. 백엔드는 형제 레포 [`../bun`](../bun)(NestJS)이다.

## 개요
- 인증: NextAuth + Kakao
- 프론트에서 팀 관련 기능(태스크·채팅·보관함 등)을 제공

## 폴더 구조
- `src/app`: App Router 페이지/라우트
- `src/app/api`: API 라우트 (NextAuth 포함)
- `src/lib/auth.ts`: NextAuth 설정
- `src/services`: 백엔드 API 호출 레이어
- `docs`: 절차·진단·참고 문서 (라우팅은 [`CLAUDE.md`](CLAUDE.md)) · `docs/tasks`: 작업별 진행 기록 · `docs/archive`: 지난 조사 기록
- `.claude`: Claude Code 팀 공유 설정 — `settings.json`(권한·훅), `rules/`(파일 종류별 규칙 — 자동 로드), `commands/`·`agents/`

## 인증/세션 흐름
- NextAuth를 통해 Kakao 로그인 수행
- 세션 정보는 `getServerSession` 및 `useSession`으로 접근

## 개발/빌드
| 용도 | 명령 |
|---|---|
| 개발 서버 | `pnpm dev` |
| 빌드 | `pnpm build` |
| 린트 | `pnpm lint` |
| 테스트 (1회) | `pnpm test:run` |
| 테스트 (watch) | `pnpm test` |
| 커버리지 | `pnpm test:coverage` |
| 타입 검사 | `pnpm typecheck` |
| **통합 검증** (lint → typecheck → test:run → build) | `pnpm ci:core` |

## 배포
`main` 브랜치에 push하면 `.github/workflows/oci_build_and_deploy_next.yml`이 실행된다.
1. 동시에 도는 세 잡 — 하나라도 실패하면 배포하지 않는다
   - `verify`: lint → typecheck → test:run(디펜스 장기 스위트 제외)
   - `verify-sim`: 디펜스 장기 스위트(워크플로 `env.SLOW_TESTS`) — 두 잡의 합이 전체 테스트
   - `build`: 이미지 빌드(Dockerfile — pnpm으로 의존성 설치, Node로 `next build`, 운영 런타임 Node 24) → 레지스트리 push(SHA 태그)
2. `deploy` 잡(셋 다 성공한 뒤): 스택 YAML 전송 → Swarm 롤링 배포 → 완료까지 대기(롤백 판정은 `infra/docker-stack.app.yml` healthcheck·`update_config.monitor`). 배포 본체는 재사용 워크플로 `deploy-prod-next.yml`이다

### 수동 롤백
Actions → `Rollback Next (redeploy image tag)`(`rollback-prod-next.yml`)를 **main**에서 실행하고 `image_tag`에 되돌릴 커밋 SHA 앞 7자리를 넣는다. 이미지는 새로 빌드하지 않고 레지스트리의 `prod_next:<태그>`를 정상 배포와 같은 경로로 다시 배포한다.
- 먼저 확인하는 것: main 브랜치 · 태그 형식(소문자 16진수 7자) · 레지스트리에 이미지 존재 — 하나라도 어긋나면 배포하지 않는다
- 배포와 같은 concurrency 그룹(`deploy-prod-next`)이라 동시에 돌지 않는다(진행 중인 것은 끊지 않는다). 대기는 1개뿐이라 나중에 들어온 배포·롤백이 대기 중인 것을 취소한다 — 롤백 뒤 Actions에서 실제로 실행됐는지(cancelled 아닌지) 확인하고, 그 사이 배포된 SHA를 먼저 확인(새 배포를 되돌리지 않게)한 뒤 취소됐으면 다시 실행한다
- `image_tag`는 main에 배포됐던 커밋의 SHA를 쓴다 — 수동 실행으로 다른 브랜치에서 빌드된 태그도 레지스트리에 있으면 확인을 통과한다
- DB 스키마·API 계약이 바뀐 배포 이전으로 되돌릴 때는 백엔드 호환을 먼저 확인한다
- 스택 YAML은 현재 main의 것을 쓴다 — Node 런타임 전환(2026-10-19, 3d9dbd6) 이전 이미지는 healthcheck가 맞지 않을 수 있다
- 공통 절차는 백엔드 레포 `docs/deploy.md` "수동 롤백"

PR에서는 `verify`·`verify-sim`만 돈다. 같은 PR에 새 push가 오면 이전 실행은 취소된다.
Actions의 수동 실행(`workflow_dispatch`)은 고른 브랜치를 그대로 빌드·배포한다 — main이 아닌 브랜치로 돌리지 않는다.

서버에서 백엔드를 부르는 로그인 호출은 런타임 env `SERVER_API_BASE`(`infra/docker-stack.app.yml`, 같은 overlay 내부 주소)로 직행한다. 없으면 `NEXT_PUBLIC_API`로 폴백한다(`src/services/serverFetch.ts`).

`docs/**`·`*.md`만 바꾼 push는 워크플로를 트리거하지 않는다(`paths-ignore`).
