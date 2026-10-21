---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "src/test/**"
  - "vitest.config.mts"
---

# 테스트 규칙

- 실행은 `pnpm test:run`(1회)이다. `pnpm test`는 watch라 끝나지 않는다(`CLAUDE.md` Never).
- 테스트 파일은 대상 옆에 `*.test.ts(x)`로 둔다(`vitest.config.mts`의 `include: ['**/*.test.{ts,tsx}']`). `@/` alias를 쓸 수 있다.
- 현재 환경은 `environment: 'node'`이고 `globals: true`다. 순수 유틸 함수 테스트가 기준이다.
- 컴포넌트·훅 테스트는 파일 맨 위에 `// @vitest-environment jsdom`을 둔다. `src/test/setup.ts`(jest-dom matcher)는 `setupFiles`로 연결돼 있다. `.claude/**`(worktree)와 `node_modules`는 수집에서 제외된다.
