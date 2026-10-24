/**
 * 시뮬레이터 병렬 일 목록 (pool.ts) — 인자·결과는 직렬화 가능한 값(숫자·배열·웨이브 객체)만
 * 순차(이 프로세스)와 워커가 같은 함수를 부른다 — 결과가 같음은 pool.test.ts가 지킨다
 */

import { WEEKLY_MAPS } from '../../engine';
import { runCorpusCase } from '../corpus/corpus';
import { type EndlessRun, createEndlessRun, endlessCollapse, endlessRunCritical, endlessRunFix, endlessWallFrom, endlessWallPrefix, generateCampaignStage } from './generate';
import { cardPolicyRun, endlessSearchRun, endlessSeedRuns } from './report';
import type { SearchState } from './search';
import { weeklyCollapse } from './weekly';

/** 무한 보정 판 — seed별로 웨이브를 이어 간다(pin으로 같은 워커에 묶는다) */
const endlessRuns = new Map<number, EndlessRun>();
/** 탐색 봇 판의 램프 무관 앞부분 — (설계표, seed)별. 설계표가 바뀌면 다시 만든다 */
const wallPrefixes = new Map<string, SearchState>();

export const JOBS = {
  campaignStage: (stageIndex: number, guesses: readonly number[]) => generateCampaignStage(stageIndex, guesses),
  endlessOpen: (seed: number, guesses: readonly number[]) => {
    endlessRuns.set(seed, createEndlessRun(seed, guesses));
    return true;
  },
  endlessCritical: (seed: number, n: number, guess: number) => endlessRunCritical(endlessRuns.get(seed)!, n, guess),
  endlessFix: (seed: number, n: number, pressure: number) => {
    endlessRunFix(endlessRuns.get(seed)!, n, pressure);
    return true;
  },
  endlessCollapse: (designed: readonly number[], rampPermille: number, seed: number) => endlessCollapse(designed, rampPermille, seed),
  endlessWallCached: (designed: readonly number[], rampPermille: number, seed: number) => {
    const key = `${seed}:${designed.join(',')}`;
    let prefix = wallPrefixes.get(key);
    if (!prefix) {
      prefix = endlessWallPrefix(designed, seed);
      wallPrefixes.set(key, prefix);
    }
    return endlessWallFrom(prefix, designed, rampPermille, seed);
  },
  reportEndless: (seed: number) => endlessSeedRuns(seed),
  reportSearch: (seed: number) => endlessSearchRun(seed),
  reportCard: (card: number, force: boolean, seed: number) => cardPolicyRun(card, force, seed),
  weeklyCollapse: (mapIndex: number, combo: readonly number[], seed: number) => weeklyCollapse(WEEKLY_MAPS[mapIndex], combo, seed),
  /** 차등 테스트 코퍼스 판 하나 (corpus/corpus.ts) */
  corpusCase: (id: number) => runCorpusCase(id),
};

export type JobName = keyof typeof JOBS;
