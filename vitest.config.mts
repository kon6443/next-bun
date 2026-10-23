import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // tsconfig 의 jsx: preserve 는 Next 가 변환한다 — 테스트에서는 React 17+ 자동 런타임으로 변환해 React import 없이 JSX 를 쓴다
  esbuild: { jsx: 'automatic' },
  // CSS 모듈을 쓰는 컴포넌트도 테스트에서 import할 수 있게 — 프로젝트 PostCSS(Tailwind 플러그인)는 vitest에서 읽지 않는다(스타일은 검증 대상이 아니다)
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'node', // 순수 유틸 함수 테스트는 node 환경에서 실행
    globals: true,
    include: ['**/*.test.{ts,tsx}'],
    // .claude/worktrees 는 다른 브랜치 작업트리(자체 node_modules 포함)라 수집하면 판정이 오염된다
    exclude: ['**/node_modules/**', '.next/**', '.claude/**'],
    // jest-dom matcher — 컴포넌트·훅 테스트는 파일 상단 `// @vitest-environment jsdom` 으로 환경을 바꾼다
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
