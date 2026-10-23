import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { CAMPAIGN_DESIGN } from './design';
import { type GeneratedStage, endlessCollapses, fitRampSearch, generateEndlessDesigned, wavesFileText } from './generate';
import { withPool } from './pool';
import { allCombos, evaluatePairs, weeklyCombosText } from './weekly';

const WAVES_PATH = join(__dirname, '../../engine/data/waves.ts');
const COMBOS_PATH = join(__dirname, '../../engine/data/weeklyCombos.ts');

/** 레벨링 모델(tools/leveling_model.py) 압력 — 이분 탐색 시작값 */
const CAMPAIGN_GUESS: readonly (readonly number[])[] = [
  [18, 24, 31, 21, 52, 69],
  [22, 29, 36, 24, 58, 53, 79, 117],
  [25, 36, 48, 35, 75, 67, 93, 138],
  [29, 40, 52, 36, 80, 73, 100, 152],
  [34, 45, 62, 46, 97, 90, 122, 164, 125, 265],
  [40, 52, 65, 49, 107, 95, 128, 175, 134, 285],
  [42, 54, 76, 58, 120, 108, 147, 194, 153, 316],
  [52, 65, 87, 71, 137, 129, 172, 229, 187, 370, 343, 520],
];
/** 무한 대역 판정 seed — 탐색 봇·기준 봇이 같은 묶음(21개)을 쓴다 */
const BAND_SEEDS = Array.from({ length: 21 }, (_, i) => 101 + i);
/**
 * 램프 맞춤 목표 — 탐색 봇 벽 중앙값. 대역(40~50) 가운데 45면 기준 봇이 대역 위(38)라 아래쪽 42로 둔다
 * (두 봇 차이 ≈ 7웨이브 — 42에서 기준 봇이 28~35 안. 2026-10-22 스윕: 램프 2029‰ 기준 38·탐색 45 / 3000‰ 34·42)
 */
const RAMP_TARGET_WALL = 42;
const ENDLESS_GUESS = [
  32, 38, 50, 31, 70, 55, 75, 91, 62, 133, 113, 145, 181, 117, 247, 204, 251, 308, 204, 414, 348, 419, 494, 340, 624, 527, 641, 713, 458, 777,
];

/**
 * 웨이브 데이터 생성 (§S3 용도 ①) — 데이터·봇을 바꿨을 때만 돌린다. 뒤이어 ENGINE_VERSION·골든·매니페스트를 다시 만든다
 * DEFENSE_SIM_WRITE=1 pnpm exec vitest run src/app/games/defense/engine-dev/sim/generate.test.ts
 */
describe.runIf(process.env.DEFENSE_SIM_WRITE === '1' && process.env.DEFENSE_SIM_WEEKLY !== '1')('디펜스 웨이브 생성', () => {
  it('캠페인 8스테이지 + 무한 설계 웨이브 1~30을 임계 압력으로 역산해 waves.ts에 쓴다', async () => {
    // 진행 로그(시각·단계) — 오래 도는 생성의 현재 위치를 밖에서 볼 수 있게
    const log = (line: string) => console.log(`[defense sim ${new Date().toTimeString().slice(0, 8)}] ${line}`);
    await withPool(async (pool) => {
      log(`시작 — 워커 ${pool.size}개`);
      const stages = await pool.map<GeneratedStage>('campaignStage', CAMPAIGN_DESIGN.map((_, i) => [i, CAMPAIGN_GUESS[i]]));
      log('캠페인 8스테이지 끝');
      const endless = await generateEndlessDesigned(pool, [11, 22, 33, 44, 55, 66, 77, 88, 99], ENDLESS_GUESS, log);
      for (const s of stages) expect(s.pressures.every((p) => p > 0)).toBe(true);
      // 램프는 탐색 봇 벽 RAMP_TARGET_WALL에 맞춘다(D-029 (B)) — 두 봇은 같은 seed 묶음(BAND_SEEDS)으로 잰다
      const ramp = await fitRampSearch(pool, endless.pressures, BAND_SEEDS, RAMP_TARGET_WALL, log);
      const greedy = await endlessCollapses(pool, endless.pressures, ramp.rampPermille, BAND_SEEDS);
      writeFileSync(WAVES_PATH, wavesFileText(stages, endless.pressures, ramp.rampPermille));
      console.log('[defense sim generate]', JSON.stringify({ workers: pool.size, campaign: stages.map((s) => s.pressures), endless: endless.pressures, ramp, greedy }));
      // §L8 두 대역 — 벗어나면 데이터는 기록하되 실패로 알린다(결정 요청 대상)
      const median = (xs: readonly number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
      expect(median(greedy)).toBeGreaterThanOrEqual(28);
      expect(median(greedy)).toBeLessThanOrEqual(35);
      expect(median(ramp.walls)).toBeGreaterThanOrEqual(40);
      expect(median(ramp.walls)).toBeLessThanOrEqual(50);
    });
  }, 7_200_000);
});

/**
 * 주간 규칙 조합 허용 목록 생성 (§S5 용도 ③) — 웨이브 데이터를 다시 만든 뒤 따로 돌린다(같은 프로세스면 쓰기 전 waves.ts를 읽는다)
 * DEFENSE_SIM_WRITE=1 DEFENSE_SIM_WEEKLY=1 pnpm exec vitest run src/app/games/defense/engine-dev/sim/generate.test.ts
 */
describe.runIf(process.env.DEFENSE_SIM_WRITE === '1' && process.env.DEFENSE_SIM_WEEKLY === '1')('디펜스 주간 조합 허용 목록', () => {
  it('상충 없는 조합 × 주간 맵 9개 쌍을 기준 봇으로 재고 대역 안 쌍만 weeklyCombos.ts에 쓴다', async () => {
    const pairs = await withPool((pool) => evaluatePairs(pool, allCombos(), 3));
    expect(pairs.filter((c) => c.allowed).length).toBeGreaterThan(50);
    writeFileSync(COMBOS_PATH, weeklyCombosText(pairs, 3));
  }, 7_200_000);
});
