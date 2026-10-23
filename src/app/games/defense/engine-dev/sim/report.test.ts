import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { WEEKLY_COMBOS } from '../../engine';
import { type ReportSizes, campaignReport, endlessReport, reportMarkdown } from './report';
import { withPool } from './pool';
import { PAIR_SEEDS, WEEKLY_IMPACT_MAX, WEEKLY_IMPACT_MIN } from './weekly';

/**
 * 밸런스 보고서 — 전체 매트릭스(§S5). CI에서 돌지 않는다
 * DEFENSE_SIM=1 [DEFENSE_SIM_OUT=<폴더>] [DEFENSE_SIM_SIZE=small] pnpm exec vitest run src/app/games/defense/engine-dev/sim/report.test.ts
 * 결과: <폴더>/defense-balance.md · defense-balance.json (기본 폴더 = OS 임시 폴더)
 */
describe.runIf(process.env.DEFENSE_SIM === '1')('디펜스 밸런스 보고서', () => {
  it('캠페인·무한·주간 지표를 표로 만든다', async () => {
    const small = process.env.DEFENSE_SIM_SIZE === 'small';
    // 탐색 봇은 기준 봇과 같은 seed(1~)에서 최소 20판 — 상위 플레이어 대역 판정 표본
    const sizes: ReportSizes = small ? { novice: 6, endless: 8, search: 2, augment: 3 } : { novice: 20, endless: 100, search: 21, augment: 20 };
    const campaign = campaignReport(sizes);
    // 허용 쌍이 다른 seed에서도 대역 안인지 다시 잰다 — 표본 (맵, 조합) 쌍
    const sample = WEEKLY_COMBOS.filter((_, i) => i % (small ? 40 : 8) === 0);
    const { endless, impacts } = await withPool(async (pool) => {
      const endlessRows = await endlessReport(pool, sizes);
      // 기준(무규칙)과 쌍을 같은 seed로 — 같은 웨이브 구성·증강 제시로 비교해야 규칙 영향만 남는다
      // 생성과 같은 정의(seed PAIR_SEEDS개 평균의 비)로, 생성에 쓰지 않은 seed(7000+)에서 잰다
      const args: [number, readonly number[], number][] = [];
      sample.forEach((entry, i) => {
        for (let s = 0; s < PAIR_SEEDS; s++) args.push([entry[0], entry.slice(1), 7000 + i * PAIR_SEEDS + s], [entry[0], [0], 7000 + i * PAIR_SEEDS + s]);
      });
      const scores = await pool.map<number>('weeklyCollapse', args);
      const mean = (i: number, offset: number) => {
        let sum = 0;
        for (let s = 0; s < PAIR_SEEDS; s++) sum += scores[(i * PAIR_SEEDS + s) * 2 + offset];
        return sum / PAIR_SEEDS;
      };
      return { endless: endlessRows, impacts: sample.map((_, i) => Math.round((mean(i, 0) * 1000) / Math.max(1, mean(i, 1)))) };
    });
    const weekly = { evaluated: impacts.length, allowed: impacts.filter((x) => x >= WEEKLY_IMPACT_MIN && x <= WEEKLY_IMPACT_MAX).length, impacts };
    const markdown = reportMarkdown(campaign, endless, weekly, sizes);
    const out = process.env.DEFENSE_SIM_OUT ?? tmpdir();
    writeFileSync(join(out, 'defense-balance.md'), markdown + '\n');
    writeFileSync(join(out, 'defense-balance.json'), JSON.stringify({ sizes, campaign, endless, weekly }, null, 1));
    console.log(markdown);
    expect(campaign).toHaveLength(8);
  }, 7_200_000);
});
