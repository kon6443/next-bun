---
paths:
  - "src/lib/auth.ts"
  - "src/app/api/auth/**"
  - "src/types/next-auth.d.ts"
  - "src/app/components/SessionProvider.tsx"
---

> **로드 방식**: 위 `paths`의 파일을 읽는 순간 자동 로드(백엔드 세션에선 훅이 주입). 2026-09-23 `docs/assistant_rules_nextauth.md`에서 이동. 카카오 로그인 지연 조사는 `../bun/docs/tasks/tasks-kakao-login-latency.md`.

## NextAuth 점검 규칙

NextAuth 관련 작업에서 지켜야 할 기준을 정리합니다.

### 기본 규칙
- NextAuth 라우트는 `handler`에 전달 인자를 정확히 넘긴다.
- 세션/JWT 페이로드를 불필요하게 키우지 않는다.
- 페이지 로드 시 `/api/auth/session` 호출을 최소화한다.
