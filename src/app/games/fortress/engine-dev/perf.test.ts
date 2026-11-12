import { describe, it, expect } from 'vitest';
import { runPerf } from './perfScenarios';

/**
 * PoC 성능 실측 (fortress §10) — 수동, CI에서 돌지 않는다. 수치는 표로 출력해 메인 WORKLOG에 옮긴다
 * FORTRESS_PERF=1 pnpm exec vitest run src/app/games/fortress/engine-dev/perf.test.ts
 * plain Node(백엔드와 같은 런타임 기준): 디펜스 perf.test.ts 머리 주석처럼 perfScenarios.runPerf를 부르는 임시 진입 파일을 esbuild로 번들해 node로 실행
 */
describe.runIf(process.env.FORTRESS_PERF === '1')('포트리스 PoC 측정', () => {
  it('측정표', () => {
    const report = runPerf();
    console.table(report);
    expect(Object.keys(report).length).toBeGreaterThan(10);
  }, 600_000);
});
