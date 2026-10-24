import { describe, expect, it } from 'vitest';
import { withPool } from '../sim/pool';
import corpusFixture from './corpus.expected.json';
import portableFixture from './portable.json';
import { CORPUS_VERSION, type CorpusExpected, type runCorpusCase, diffCorpus, runCorpusCase as runLocal } from './corpus';
import { CHECKPOINT_TICKS, type PortableCase, computeExpected, diffExpected } from './portableRunner';
import { CORPUS_SIZE, defaultSampleIds } from './selection';

/**
 * 차등 테스트 (defense 엔진 리팩토링 안전망) — 현재 엔진으로 고정한 기대값과 지금 엔진의 결과가 판마다 같아야 한다
 * - 이식용 표본(portable.json): 입력 로그를 그대로 다시 돌려 최종 결과 + 300틱마다 중간 해시(백엔드 사본과 같은 러너)
 * - 코퍼스(corpus.expected.json): 봇이 다시 플레이 → 결과·중간 해시 요약. 기본은 (모드·봇) 구성마다 1판,
 *   전체 4,000판은 DEFENSE_CORPUS=full pnpm exec vitest run src/app/games/defense/engine-dev/corpus/corpus.test.ts (워커 병렬)
 */
const corpus = corpusFixture as { version: number; checkpointTicks: number; count: number; cases: CorpusExpected[] };
const portable = portableFixture as { version: number; checkpointTicks: number; cases: PortableCase[] };

describe('디펜스 차등 테스트 — 이식용 표본(입력 로그 재생)', () => {
  it('형식·버전', () => {
    expect(portable.version).toBe(CORPUS_VERSION);
    expect(portable.checkpointTicks).toBe(CHECKPOINT_TICKS);
    expect(portable.cases.length).toBeGreaterThanOrEqual(50);
  });

  it('모든 판이 최종 결과·중간 해시까지 같다', () => {
    const failures: string[] = [];
    for (const c of portable.cases) {
      const actual = computeExpected(c.input);
      const diff = 'error' in actual ? actual.error : diffExpected(actual, c.expected);
      if (diff) failures.push(`${c.id} (${c.input.mode} ${c.input.boardKey}): ${diff}`);
    }
    expect(failures).toEqual([]);
  }, 300_000);
});

describe('디펜스 차등 테스트 — 코퍼스(봇 재플레이)', () => {
  it('형식·버전', () => {
    expect(corpus.version).toBe(CORPUS_VERSION);
    expect(corpus.count).toBe(CORPUS_SIZE);
    expect(corpus.cases).toHaveLength(CORPUS_SIZE);
  });

  const full = process.env.DEFENSE_CORPUS === 'full';
  it(full ? `전체 ${CORPUS_SIZE}판` : '구성별 표본', async () => {
    const ids = full ? corpus.cases.map((c) => c.id) : defaultSampleIds();
    type Run = ReturnType<typeof runCorpusCase>;
    const runs = full ? await withPool((pool) => pool.map<Run>('corpusCase', ids.map((id) => [id]))) : ids.map((id) => runLocal(id));
    const failures: string[] = [];
    runs.forEach((run, k) => {
      const diff = diffCorpus(run.expected, corpus.cases[ids[k]]);
      if (diff) failures.push(`#${ids[k]}: ${diff}`);
    });
    expect(failures).toEqual([]);
  }, 3_600_000);
});
