---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "src/test/**"
  - "vitest.config.mts"
---

# 테스트 규칙

- 실행은 `bun run test:run`(1회)이다. `bun run test`는 watch라 끝나지 않는다(`CLAUDE.md` Never).
- 테스트 파일은 대상 옆에 `*.test.ts(x)`로 둔다(`vitest.config.mts`의 `include: ['**/*.test.{ts,tsx}']`). `@/` alias를 쓸 수 있다.
- 현재 환경은 `environment: 'node'`이고 `globals: true`다. 순수 유틸 함수 테스트가 기준이다.
- 컴포넌트 테스트를 추가하려면 먼저 설정을 바꿔야 한다. `@testing-library/react`·`jsdom`·`src/test/setup.ts`(jest-dom)는 있지만 `vitest.config.mts`에 `environment: 'jsdom'`과 `setupFiles`가 연결돼 있지 않다. 설정 변경은 별도 변경으로 분리한다.
- 버그를 잡았을 가장 작은 테스트만 추가한다. 구현 디테일에 묶인 테스트는 만들지 않는다.
