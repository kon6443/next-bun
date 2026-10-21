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
1. `verify` 잡: lint → typecheck → test:run — 실패하면 배포하지 않는다
2. `deploy` 잡: 이미지 빌드(Dockerfile — pnpm으로 의존성 설치, Node로 `next build`, 운영 런타임 Node 24) → 레지스트리 push → Swarm 배포

서버에서 백엔드를 부르는 로그인 호출은 런타임 env `SERVER_API_BASE`(`infra/docker-stack.app.yml`, 같은 overlay 내부 주소)로 직행한다. 없으면 `NEXT_PUBLIC_API`로 폴백한다(`src/services/serverFetch.ts`).

`docs/**`·`*.md`만 바꾼 push는 워크플로를 트리거하지 않는다(`paths-ignore`).
