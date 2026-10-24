/**
 * 차등 테스트 코퍼스 (defense 엔진 리팩토링 0단계) — 리팩토링 전후 엔진이 같은 판에서 같은 결과를 내는지의 안전망
 * 판 = (번호 → 모드·보드·seed·봇·봇 seed)를 결정적으로 만든다. 봇이 명령을 고르며 판을 끝까지 돌리고(engine-dev/sim 봇 재사용),
 * 그 입력 로그로 simulateReplay·중간 해시(portableRunner)를 낸 값이 기대값이다. 픽스처(corpus.expected.json)는 입력 대신
 * 판 번호와 기대값만 둔다 — 같은 번호면 같은 판이 다시 만들어진다(봇·엔진이 결정적)
 * 봇은 엔진 상태를 보고 명령을 고르므로, 엔진이 1비트라도 달라지면 명령·해시가 갈라져 드러난다
 */

import type { ReplayInput } from '../../engine';
import { GameDriver } from '../driver';
import { type Bot, botRandom, greedyBot, noviceBot, scriptedBot } from '../sim/bots';
import { runGame } from '../sim/runner';
import { CAMPAIGN_SCRIPTS } from '../sim/scripts';
import { CHECKPOINT_TICKS, type PortableExpected, computeExpected } from './portableRunner';

/** 코퍼스 형식이 바뀌면 올린다(픽스처 재생성 신호) */
export const CORPUS_VERSION = 2;

export type CorpusBot = 'greedy' | 'greedy-early' | 'greedy-noise' | 'greedy-augrand' | 'novice' | 'scripted' | 'idle';

export type CorpusCase = { id: number; mode: 'campaign' | 'endless' | 'weekly'; boardKey: string; seed: number; bot: CorpusBot; botSeed: number };

/** 픽스처 한 줄 — 중간 해시는 목록 대신 요약(digest)과 개수(용량). 전체 목록은 이식용 부분집합(portable.json)에만 */
export type CorpusExpected = {
  id: number;
  ticks: number;
  /** 입력 로그 길이(숫자 개수 — 명령 수가 아님) */
  commands: number;
  result: PortableExpected['result'];
  checkpointCount: number;
  checkpointDigest: string;
};

const DIFFICULTIES = ['', '-easy', '-hard'] as const;
/** 시험 스테이지 — E2 아레나는 타워 6종·분기·궁극·적 11종·증강이 다 나온다 */
const TEST_STAGES = ['e1', 'e2', 'e2-rules'] as const;
const BOTS: readonly CorpusBot[] = ['greedy', 'greedy-early', 'greedy-noise', 'greedy-augrand', 'novice', 'scripted'];

/** 32비트 정수 섞기(결정적) — 번호마다 고르게 퍼진 값 */
function mix(n: number): number {
  let x = (n + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * 판 번호 → 판. 구성(번호 기준 고정): 캠페인 60%(8스테이지 × 보통·쉬움·어려움, 그중 10%는 시험 스테이지 e1·e2·e2-rules) · 무한 20% · 주간 20%
 * seed는 0 ~ SEED_MAX(2³²−1) 전 범위 — 부호 없는 32비트 처리(>>> 0)가 바뀌면 큰 seed 판이 갈라지게
 * 주간 판의 내용(맵·규칙)은 seed만으로 정해진다(pickWeekly) — 주차 키는 해시의 stageId 라벨
 * 봇: 기준(greedy)·조기 호출·가치 교란·증강 무작위·초보(무작위 배치, 누수 많은 판)·각본(캠페인만 — 다른 모드는 greedy로)
 *   · 2%는 idle(아무것도 안 함 — 캠페인은 웨이브를 부르지 않아 판 상한 MAX_TICKS까지 간다)
 */
export function corpusCase(id: number): CorpusCase {
  const h = mix(id);
  const seed = mix(id * 7 + 1);
  const botSeed = (mix(id * 13 + 5) % 100000) + 1;
  const kind = h % 10;
  let bot: CorpusBot = (h >>> 20) % 50 === 0 ? 'idle' : BOTS[(h >>> 8) % BOTS.length];
  if (kind < 6) {
    if ((h >>> 16) % 10 === 0) return { id, mode: 'campaign', boardKey: TEST_STAGES[(h >>> 20) % TEST_STAGES.length], seed, bot: bot === 'scripted' ? 'greedy' : bot, botSeed };
    const stage = (h >>> 4) % 8;
    const difficulty = DIFFICULTIES[(h >>> 12) % 3];
    return { id, mode: 'campaign', boardKey: `s${stage + 1}${difficulty}`, seed, bot, botSeed };
  }
  if (bot === 'scripted') bot = 'greedy';
  if (kind < 8) return { id, mode: 'endless', boardKey: 'endless-s1', seed, bot, botSeed };
  const week = ((h >>> 4) % 52) + 1;
  const year = 2026 + ((h >>> 10) % 2);
  return { id, mode: 'weekly', boardKey: `weekly-${year}-w${String(week).padStart(2, '0')}`, seed, bot, botSeed };
}

function makeBot(c: CorpusCase): Bot {
  switch (c.bot) {
    case 'greedy':
      return greedyBot();
    case 'greedy-early':
      return greedyBot({ earlyCall: true });
    case 'greedy-noise':
      return greedyBot({ noise: 0.6, random: botRandom(c.botSeed) });
    case 'greedy-augrand':
      return greedyBot({ augment: 'random', random: botRandom(c.botSeed) });
    case 'novice':
      return noviceBot(c.botSeed);
    case 'idle':
      return { name: 'idle', act() {} };
    case 'scripted': {
      const stage = Number(/^s(\d+)/.exec(c.boardKey)?.[1] ?? 1) - 1;
      return scriptedBot(CAMPAIGN_SCRIPTS[stage]);
    }
  }
}

/** 판을 봇으로 끝까지 — 입력 로그(리플레이) */
export function playCorpusCase(c: CorpusCase): ReplayInput {
  const driver = GameDriver.fromBoard(c.mode, c.boardKey, c.seed);
  runGame(driver, makeBot(c));
  return driver.toReplayInput();
}

/** FNV-1a 32비트 — 중간 해시 목록 요약 */
export function digestOf(hashes: readonly string[]): string {
  let h = 0x811c9dc5;
  const text = hashes.join(',');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 판 하나의 기대값(또는 이 엔진으로 돌린 실제값) */
export function runCorpusCase(id: number): { expected: CorpusExpected; input: ReplayInput; checkpoints: string[] } {
  const c = corpusCase(id);
  const input = playCorpusCase(c);
  const computed = computeExpected(input, CHECKPOINT_TICKS);
  if ('error' in computed) throw new Error(`코퍼스 #${id} (${c.mode} ${c.boardKey} ${c.bot}): ${computed.error}`);
  return {
    input,
    checkpoints: computed.checkpoints,
    expected: {
      id,
      ticks: input.ticks,
      commands: input.inputs.length,
      result: computed.result,
      checkpointCount: computed.checkpoints.length,
      checkpointDigest: digestOf(computed.checkpoints),
    },
  };
}

/** 첫 차이 — 같으면 null */
export function diffCorpus(actual: CorpusExpected, expected: CorpusExpected): string | null {
  if (actual.ticks !== expected.ticks) return `ticks ${actual.ticks} ≠ ${expected.ticks}`;
  if (actual.commands !== expected.commands) return `commands ${actual.commands} ≠ ${expected.commands}`;
  if (actual.checkpointCount !== expected.checkpointCount) return `checkpointCount ${actual.checkpointCount} ≠ ${expected.checkpointCount}`;
  if (actual.checkpointDigest !== expected.checkpointDigest) return `checkpointDigest ${actual.checkpointDigest} ≠ ${expected.checkpointDigest}`;
  for (const key of Object.keys(expected.result) as (keyof CorpusExpected['result'])[]) {
    const a = JSON.stringify(actual.result[key]);
    const e = JSON.stringify(expected.result[key]);
    if (a !== e) return `result.${key}: ${a} ≠ ${e}`;
  }
  return null;
}
