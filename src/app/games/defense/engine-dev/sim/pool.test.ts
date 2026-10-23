import { describe, it, expect } from 'vitest';
import { ENDLESS_DESIGNED_PRESSURE, ENDLESS_RAMP_PERMILLE } from '../../engine/data/waves';
import { endlessCollapses, endlessWall, endlessWallFrom, endlessWallPrefix } from './generate';
import { type SimPool, openPool, withPool } from './pool';

/** 보정 판(seed별 상태를 워커에 이어 두는 일) 웨이브 1~3 — generateEndlessDesigned와 같은 호출 순서 */
async function calibrate(pool: SimPool, seeds: readonly number[]): Promise<(number | null)[][]> {
  const pin = (i: number) => i;
  await pool.map('endlessOpen', seeds.map((seed) => [seed, ENDLESS_DESIGNED_PRESSURE]), pin);
  const out: (number | null)[][] = [];
  for (let n = 1; n <= 3; n++) {
    const criticals = await pool.map<number | null>('endlessCritical', seeds.map((seed) => [seed, n, 40]), pin);
    out.push(criticals);
    await pool.map('endlessFix', seeds.map((seed) => [seed, n, 30 + n]), pin);
  }
  return out;
}

async function sample(pool: SimPool) {
  const seeds = [3, 4, 5];
  return {
    collapse: await endlessCollapses(pool, ENDLESS_DESIGNED_PRESSURE, ENDLESS_RAMP_PERMILLE, seeds),
    calibration: await calibrate(pool, seeds),
    weekly: await pool.map<number>('weeklyCollapse', [[0, [0], 3], [4, [0, 1, 2], 3], [8, [3, 6], 4]]),
  };
}

describe('시뮬레이터 병렬 실행 (pool.ts)', () => {
  it('워커 3개 결과가 순차(이 프로세스)와 바이트 단위로 같다 — 판 결과·seed별 보정 판 상태·주간 점수', async () => {
    const sequential = await sample(openPool(1));
    const parallel = await withPool(sample, 3);
    expect(JSON.stringify(parallel)).toBe(JSON.stringify(sequential));
  }, 120_000);

  it('탐색 봇 램프 무관 앞부분 재사용 — 앞부분에서 램프만 바꿔 이은 벽이 처음부터 돈 벽과 같다', () => {
    // 작은 빔으로 — 같음은 빔 크기와 무관하다(앞부분이 31웨이브 전에 멈추는지·이어 돌 때 난수 순번이 같은지를 본다)
    const small = { beam: 2, candidates: 2, horizon: 2 };
    for (const seed of [105]) {
      const prefix = endlessWallPrefix(ENDLESS_DESIGNED_PRESSURE, seed, small);
      for (const ramp of [ENDLESS_RAMP_PERMILLE, 12000]) {
        expect(endlessWallFrom(prefix, ENDLESS_DESIGNED_PRESSURE, ramp, seed, small)).toBe(endlessWall(ENDLESS_DESIGNED_PRESSURE, ramp, seed, small));
      }
    }
  }, 120_000);

  it('워커 안 오류는 호출부 Promise 거절로 돌아온다', async () => {
    await withPool(async (pool) => {
      await expect(pool.map('endlessCritical', [[999_999, 1, 40]])).rejects.toThrow();
    }, 2);
  }, 60_000);
});
