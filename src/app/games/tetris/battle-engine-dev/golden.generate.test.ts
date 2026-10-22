import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildBattleGoldenCases, formatBattleGoldenJson } from './goldenCases';

const FIXTURE_PATH = join(__dirname, '../battle-engine/__fixtures__/golden-battle-replays.json');

/**
 * 대전 골든 픽스처 재생성 — 대전 규칙을 바꾸고 BATTLE_ENGINE_VERSION을 올렸을 때만 돌린다
 * TETRIS_BATTLE_GOLDEN_WRITE=1 pnpm exec vitest run src/app/games/tetris/battle-engine-dev/golden.generate.test.ts
 */
describe.runIf(process.env.TETRIS_BATTLE_GOLDEN_WRITE === '1')('대전 골든 픽스처 생성', () => {
  it('케이스를 실제 플레이로 만들어 파일에 쓴다', () => {
    const cases = buildBattleGoldenCases();
    expect(cases.length).toBeGreaterThanOrEqual(17);
    writeFileSync(FIXTURE_PATH, formatBattleGoldenJson(cases));
  }, 600_000);
});
