## NextAuth 점검 규칙

NextAuth 관련 작업에서 지켜야 할 기준을 정리합니다.

### 기본 규칙
- NextAuth 라우트는 `handler`에 전달 인자를 정확히 넘긴다.
- 세션/JWT 페이로드를 불필요하게 키우지 않는다.
- 페이지 로드 시 `/api/auth/session` 호출을 최소화한다.
