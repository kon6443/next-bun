import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildGoldenCases, formatGoldenJson } from './goldenCases';

const FIXTURE_PATH = join(__dirname, '../engine/__fixtures__/golden-replays.json');

/**
 * 골든 픽스처 재생성 — 엔진 규칙·데이터를 바꾸고 ENGINE_VERSION을 올렸을 때만 돌린다 (뒤이어 매니페스트도 다시 만든다)
 * DEFENSE_GOLDEN_WRITE=1 pnpm exec vitest run src/app/games/defense/engine-dev/golden.generate.test.ts
 */
describe.runIf(process.env.DEFENSE_GOLDEN_WRITE === '1')('디펜스 골든 픽스처 생성', () => {
  it('케이스를 실제 플레이로 만들어 파일에 쓴다', () => {
    const cases = buildGoldenCases();
    expect(cases.length).toBeGreaterThanOrEqual(20);
    writeFileSync(FIXTURE_PATH, formatGoldenJson(cases));
  }, 120_000);
});
