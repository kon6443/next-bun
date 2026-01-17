## 프로젝트 안내

이 문서는 이 프로젝트를 빠르게 이해하고 동일한 규칙을 적용하기 위한 요약입니다.
새로운 참여자나 다른 AI가 이 문서만 읽어도 바로 작업을 시작할 수 있도록 구성합니다.

### 1) 프로젝트 개요
- Next.js 기반의 웹 앱
- 인증: NextAuth + Kakao
- 프론트에서 팀 관련 기능을 제공

### 2) 아키텍처/폴더 구조
- `src/app`: App Router 페이지/라우트
- `src/app/api`: API 라우트 (NextAuth 포함)
- `src/lib/auth.ts`: NextAuth 설정
- `src/services`: 백엔드 API 호출 레이어
- `docs`: 프로젝트 규칙/가이드 문서

### 3) 인증/세션 흐름 요약
- NextAuth를 통해 Kakao 로그인 수행
- 세션 정보는 `getServerSession` 및 `useSession`으로 접근
- 성능 이슈 시 `/api/auth/session` 호출 최소화 및 타이밍 측정

### 4) 규칙/룰 문서
- 작업 규칙: `/docs/assistant_workflow.md`
- 진단 규칙: `/docs/assistant_rules_diagnostics.md`
- NextAuth 규칙: `/docs/assistant_rules_nextauth.md`

### 5) 개발/빌드
- 개발 서버: `pnpm run dev`
- 빌드: `pnpm run build`
- 린트: `pnpm run lint`
