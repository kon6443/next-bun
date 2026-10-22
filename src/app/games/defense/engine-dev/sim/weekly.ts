/**
 * 시뮬레이터 — 주간 허용 목록 (defense DESIGN §S5) — (맵, 조합)별 기준 봇 붕괴 웨이브 ÷ 그 맵 무규칙 기준(‰)
 *   영향이 [900, 1300]‰ 안인 (맵, 조합) 쌍만 weeklyCombos.ts에 넣는다 — 엔진은 주간 seed로 이 목록에서 쌍 하나를 고른다
 */

import { RULE_COUNT, TOWERS, WEEKLY_MAPS, type GameMap, conflicts, endlessBoard, scoreOf } from '../../engine';
import { GameDriver } from '../driver';
import { botRandom, greedyBot } from './bots';
import type { SimPool } from './pool';
import { runGame } from './runner';

export const WEEKLY_IMPACT_MIN = 900;
export const WEEKLY_IMPACT_MAX = 1300;
/**
 * 기준(무규칙)과 쌍 평가가 함께 쓰는 seed 수 — 같은 seed = 같은 웨이브 구성으로 비교한다
 * 2개일 때 다른 seed 재검증에서 허용 쌍의 40%만 대역 안이었다(D-031) — 6개 평균으로 구성·증강 운을 줄인다
 */
export const PAIR_SEEDS = 6;

/** 조합 = [금지 타워 + 1, 규칙...] */
export function allCombos(): number[][] {
  const out: number[][] = [];
  const rules: number[] = [];
  for (let id = 1; id <= RULE_COUNT; id++) rules.push(id);
  const pick = (k: number, start: number, chosen: number[]) => {
    if (chosen.length === k) {
      const bans = chosen.includes(6) ? TOWERS.map((t) => t.id) : [-1];
      for (const banned of bans) {
        let ok = true;
        for (let i = 0; i < chosen.length; i++) for (let j = i + 1; j < chosen.length; j++) if (conflicts(chosen[i], chosen[j], banned)) ok = false;
        if (ok) out.push([banned + 1, ...chosen]);
      }
      return;
    }
    for (let i = start; i < rules.length; i++) pick(k, i + 1, [...chosen, rules[i]]);
  };
  pick(2, 0, []);
  pick(3, 0, []);
  return out;
}

/** (맵, 조합)의 기준 봇(증강 무작위) 도달 — 랭킹 점수(클리어 웨이브 + 진척‰) — 연속값이라 붕괴 웨이브 한 칸에 묶이지 않는다 */
export function weeklyCollapse(map: GameMap, combo: readonly number[], seed: number): number {
  const stage = endlessBoard('weekly-sim', map, seed, combo.slice(1), combo[0] - 1, false);
  const driver = new GameDriver(stage, seed, 'weekly');
  runGame(driver, greedyBot({ augment: 'random', random: botRandom(seed) }));
  return scoreOf(driver.state).score / 1e6; // 랭킹 점수와 같은 정의(§L6)
}

/** 항목 = [맵 풀 인덱스, 금지 타워 + 1, 규칙...] · 영향 ‰ = 그 맵 붕괴 웨이브 ÷ 그 맵 무규칙 기준 */
export type PairImpact = { entry: number[]; impact: number; allowed: boolean };

/**
 * (맵, 조합) 쌍마다 영향 ‰ — 맵은 주간 풀 9개 전부. 도달(클리어 + 진행)의 seed 평균 ÷ 같은 seed들의 무규칙 평균
 * 기준과 평가가 같은 seed(같은 웨이브 구성)를 써서 구성 운이 아니라 규칙의 영향을 잰다
 * 판(맵 × 조합 × seed)은 병렬로 돌리고, 평균은 seed 순서대로 더한다(순차와 같은 부동소수 결과)
 */
export async function evaluatePairs(pool: SimPool, combos: readonly number[][], seedBase: number): Promise<PairImpact[]> {
  // 조합 평가와 기준이 같은 seed 묶음을 쓴다(구성 운을 상쇄) — PAIR_SEEDS개 평균
  const seeds = Array.from({ length: PAIR_SEEDS }, (_, s) => seedBase + s);
  const runs = async (list: readonly (readonly number[])[]) => {
    const args: [number, readonly number[], number][] = [];
    for (const [m, ...combo] of list) for (const seed of seeds) args.push([m, combo, seed]);
    const scores = await pool.map<number>('weeklyCollapse', args);
    return list.map((_, k) => scores.slice(k * seeds.length, (k + 1) * seeds.length).reduce((sum, v) => sum + v, 0) / seeds.length);
  };
  const baseline = (await runs(WEEKLY_MAPS.map((_, m) => [m, 0]))).map((v) => Math.max(1, v));
  const keys: number[][] = [];
  combos.forEach((combo) => WEEKLY_MAPS.forEach((_, m) => keys.push([m, ...combo])));
  const averages = await runs(keys);
  return keys.map((entry, k) => {
    const impact = Math.round((averages[k] * 1000) / baseline[entry[0]]);
    return { entry, impact, allowed: impact >= WEEKLY_IMPACT_MIN && impact <= WEEKLY_IMPACT_MAX };
  });
}

/** weeklyCombos.ts 원문 */
export function weeklyCombosText(pairs: readonly PairImpact[], seedBase: number): string {
  const allowed = pairs.filter((p) => p.allowed);
  const lines = [
    '/**',
    ' * 주간 허용 목록 (defense DESIGN §S5) — [맵 풀 인덱스, 금지 타워 + 1(0 = 없음), 규칙 id...]',
    ' * 시뮬레이터가 생성한다(engine-dev/sim — DEFENSE_SIM_WRITE=1 DEFENSE_SIM_WEEKLY=1). 손으로 고치지 않는다',
    ` * 기준: (맵, 조합)마다 기준 봇(증강 무작위) 도달(클리어 + 진행) seed ${PAIR_SEEDS}개 평균 ÷ 같은 seed 무규칙 평균이 ${WEEKLY_IMPACT_MIN}~${WEEKLY_IMPACT_MAX}‰ — ${allowed.length}/${pairs.length}쌍 허용 (seed ${seedBase}부터)`,
    ' * 원본·동기화 규칙은 ../constants.ts 머리 주석',
    ' */',
    '',
    'export const WEEKLY_COMBOS: readonly (readonly number[])[] = [',
  ];
  for (const p of allowed) lines.push(`  [${p.entry.join(', ')}], // ${p.impact}‰`);
  lines.push('];', '');
  return lines.join('\n');
}
