---
paths:
  - "src/lib/auth.ts"
  - "src/app/api/auth/**"
  - "src/app/auth/**"
  - "src/types/next-auth.d.ts"
  - "src/app/components/SessionProvider.tsx"
  - "src/app/components/AuthLoadingOverlay.tsx"
---

# 인증(NextAuth·카카오 로그인) 규칙

## NextAuth
- NextAuth 라우트는 `handler`에 전달 인자를 정확히 넘긴다.
- 세션·JWT 페이로드를 불필요하게 키우지 않는다.
- 페이지 로드 시 `/api/auth/session` 호출을 최소화한다.

## 카카오 로그인 UX
- 로그인은 `startKakaoLogin()`(`src/app/auth/shared.ts`)으로 시작한다. 이 함수는 `sessionStorage`에 `AUTH_LOADING_KEY`를 세우고 `signIn("kakao")`를 호출한다. 탭 단위 잠금으로 중복 시작(연타·버튼 여러 개)을 무시한다 — next-auth state 쿠키가 하나라 두 번 시작하면 먼저 시작한 콜백이 실패한다.
- 로그인 버튼은 `useKakaoLogin()`(`src/app/auth/useKakaoLogin.ts`)으로 만든다. 누르는 즉시 `disabled`·`aria-busy`, 시작 실패나 뒤로가기(bfcache) 복원 시 다시 활성화된다. 잠금 해제(bfcache 복원)는 `shared.ts`의 모듈 리스너가 맡으므로 버튼 없는 진입점도 `startKakaoLogin()`만 부르면 된다.
- 콜백 처리 중의 전체 화면 로딩은 `AuthLoadingOverlay`(`src/app/layout.tsx`에 마운트)가 이 플래그로 표시한다. 로그인 진입점을 새로 만들 때도 이 함수를 거친다.
- 로딩을 끝내거나 실패한 경로에서는 `clearAuthLoading()`으로 플래그를 지운다.
- 지연 조사의 현재 결론은 `../bun/docs/tasks/tasks-kakao-login-latency.md`에 있다(`CLAUDE.md` 라우팅).
