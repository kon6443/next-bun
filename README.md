# next-bun

Next.js 15 App Router + Bun 기반의 팀 협업/태스크 관리 웹앱. 백엔드는 형제 레포 [`../bun`](../bun)(NestJS)이다.

## 개요
- 인증: NextAuth + Kakao
- 프론트에서 팀 관련 기능(태스크·채팅·보관함 등)을 제공

## 폴더 구조
- `src/app`: App Router 페이지/라우트
- `src/app/api`: API 라우트 (NextAuth 포함)
- `src/lib/auth.ts`: NextAuth 설정
- `src/services`: 백엔드 API 호출 레이어
- `docs`: 영역별 규칙/가이드 문서 (라우팅은 [`CLAUDE.md`](CLAUDE.md))

## 인증/세션 흐름
- NextAuth를 통해 Kakao 로그인 수행
- 세션 정보는 `getServerSession` 및 `useSession`으로 접근
- 성능 이슈 시 `/api/auth/session` 호출 최소화 및 타이밍 측정

## 개발/빌드
| 용도 | 명령 |
|---|---|
| 개발 서버 | `bun run dev` |
| 빌드 | `bun run build` |
| 린트 | `bun run lint` |
| 테스트 (1회) | `bun run test:run` |
| 테스트 (watch) | `bun run test` |
| 커버리지 | `bun run test:coverage` |

## 배포
`main` 브랜치에 push하면 `.github/workflows/oci_build_and_deploy_next.yml`이 이미지를 빌드해 배포한다.
