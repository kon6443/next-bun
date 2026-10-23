/**
 * 시뮬레이터 보고서 (defense DESIGN §S4 지표 · §L8 대역) — 시나리오 매트릭스를 돌려 표(마크다운)와 원자료(JSON)를 만든다
 */

import {
  AUGMENTS,
  CAMPAIGN_STAGES,
  OP,
  TOWERS,
  type Wave,
  endlessStage,
  findStage,
} from '../../engine';
import { GameDriver } from '../driver';
import { type Bot, botRandom, greedyBot, noviceBot, scriptedBot } from './bots';
import { criticalPressure, holds } from './generate';
import { type GameResult, runGame, runToWaveStart } from './runner';
import { CAMPAIGN_SCRIPTS } from './scripts';
import type { SimPool } from './pool';
import { searchPlay } from './search';

export type ReportSizes = { novice: number; endless: number; search: number; augment: number };

const pct = (x: number) => `${Math.round(x * 100)}%`;
const mean = (xs: readonly number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const sd = (xs: readonly number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const median = (xs: readonly number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

// ==================== 캠페인 ====================

export type StageRow = {
  id: string;
  waves: number;
  greedy: { easy: boolean; normal: boolean; hard: boolean; lives: number };
  novice: { normal: number; easy: number; hard: number };
  scripted: boolean;
  /** 웨이브별 실측 여유도 k_crit ‰ (보통·기준 봇 — 웨이브 HP 배율을 이분 탐색) */
  kCrit: number[];
  /** 웨이브별 가장 멀리 간 적의 경로 진행률 ‰ (보통·기준 봇) */
  maxProgress: number[];
  /** 웨이브별 잃은 목숨 (보통·초보 봇 평균) */
  noviceLeaks: number[];
  /** 웨이브 종료 미사용 골드 ÷ 누적 수입 최대 (보통·기준 봇) */
  unusedGoldMax: number;
  minutes: number;
};

function scaleWave(wave: Wave, permille: number): Wave {
  return { groups: wave.groups.map((g) => ({ ...g, hp: Math.max(1, Math.floor((g.hp * permille) / 1000)) })) };
}

/** 웨이브 n의 실측 여유도 — 웨이브 시작 스냅샷에서 HP 배율 k‰를 이분 탐색(누수 0으로 막는 최대, 판정은 generate.ts holds) */
function kCritOf(stageId: string, n: number): number {
  const stage = findStage(stageId)!;
  const driver = new GameDriver(stage, 1);
  const bot = greedyBot();
  runToWaveStart(driver, bot, n);
  return criticalPressure((k) => holds(driver, n, scaleWave(stage.waves[n - 1], k), bot), 1000);
}

function clears(stageId: string, bot: () => Bot): GameResult {
  return runGame(new GameDriver(findStage(stageId)!, 1), bot());
}

export function campaignReport(sizes: ReportSizes): StageRow[] {
  return CAMPAIGN_STAGES.map((stage, i) => {
    const normal = clears(stage.id, () => greedyBot());
    const noviceRate = (suffix: string) => {
      let wins = 0;
      for (let s = 1; s <= sizes.novice; s++) if (clears(stage.id + suffix, () => noviceBot(s)).victory) wins++;
      return wins / sizes.novice;
    };
    const noviceLeaks = stage.waves.map(() => 0);
    for (let s = 1; s <= sizes.novice; s++) {
      const r = clears(stage.id, () => noviceBot(s));
      r.waves.forEach((w, n) => (noviceLeaks[n] += w.livesLost / sizes.novice));
    }
    const unused = normal.waves.filter((w) => w.endTick >= 0).map((w) => w.goldAtEnd / Math.max(1, w.incomeAtEnd));
    return {
      id: stage.id,
      waves: stage.waves.length,
      greedy: {
        easy: clears(`${stage.id}-easy`, () => greedyBot()).victory,
        normal: normal.victory,
        hard: clears(`${stage.id}-hard`, () => greedyBot()).victory,
        lives: normal.livesLeft,
      },
      novice: { normal: noviceRate(''), easy: noviceRate('-easy'), hard: noviceRate('-hard') },
      scripted: clears(stage.id, () => scriptedBot(CAMPAIGN_SCRIPTS[i])).victory,
      kCrit: stage.waves.map((_, n) => kCritOf(stage.id, n + 1)),
      maxProgress: normal.waves.map((w) => w.maxProgress),
      noviceLeaks: noviceLeaks.map((x) => Math.round(x * 10) / 10),
      unusedGoldMax: Math.max(0, ...unused),
      minutes: normal.endTick / 1800,
    };
  });
}

// ==================== 무한 ====================

export type EndlessReport = {
  greedyValue: number[];
  greedyRandom: number[];
  earlyCall: { waves: number[]; minutes: number[] };
  search: number[];
  /** 카드별 지배도 — 제시되면 반드시 고름 vs 고르지 않음, 평균 붕괴 웨이브 차 */
  augments: { card: number; forced: number; banned: number; delta: number }[];
  /** 탐색 봇 최상위 판 타워별 투자 비중 */
  diversity: number[];
};

function endlessRun(seed: number, bot: Bot): GameResult {
  return runGame(new GameDriver(endlessStage('endless-s1', seed), seed, 'endless'), bot);
}

/** 증강 정책을 바꾼 기준 봇 — card를 반드시(force) 또는 절대(ban) 고른다 */
function cardPolicyBot(card: number, force: boolean, seed: number): Bot {
  const base = greedyBot({ augment: 'random', random: botRandom(seed) });
  const random = botRandom(seed + 1);
  return {
    name: 'card-policy',
    act(driver) {
      const state = driver.state;
      while (state.augmentPending) {
        const choices = state.augmentChoices;
        let pick = choices.indexOf(card);
        if (!force || pick < 0) {
          const others = choices.map((c, i) => i).filter((i) => choices[i] !== card);
          pick = others.length > 0 ? others[Math.floor(random() * others.length)] : 0;
        }
        driver.must(OP.PICK_AUGMENT, pick);
      }
      base.act(driver);
    },
  };
}

/** 무한 판 하나(seed)의 기준 봇 지표 — 병렬 일(jobs.ts reportEndless) */
export function endlessSeedRuns(seed: number): { value: number; random: number; earlyWaves: number; earlyEndTick: number } {
  const early = endlessRun(seed, greedyBot({ earlyCall: true }));
  return {
    value: endlessRun(seed, greedyBot()).wavesCleared,
    random: endlessRun(seed, greedyBot({ augment: 'random', random: botRandom(seed) })).wavesCleared,
    earlyWaves: early.wavesCleared,
    earlyEndTick: early.endTick,
  };
}

/** 탐색 봇 판 하나(seed) — 벽과 타워 종류별 투자액 — 병렬 일(jobs.ts reportSearch) */
export function endlessSearchRun(seed: number): { cleared: number; invested: number[] } {
  const driver = searchPlay(new GameDriver(endlessStage('endless-s1', seed), seed, 'endless'), seed);
  return { cleared: driver.state.wavesCleared, invested: TOWERS.map((t) => driver.state.towers.filter((x) => x.kind === t.id).reduce((sum, x) => sum + x.invested, 0)) };
}

/** 증강 정책 판 하나 — 병렬 일(jobs.ts reportCard) */
export function cardPolicyRun(card: number, force: boolean, seed: number): number {
  return endlessRun(seed, cardPolicyBot(card, force, seed)).wavesCleared;
}

/** 판 단위 일은 병렬로, 집계는 seed·카드 순서대로(순차와 같은 결과) */
export async function endlessReport(pool: SimPool, sizes: ReportSizes): Promise<EndlessReport> {
  const seeds = Array.from({ length: sizes.endless }, (_, i) => 1 + i);
  const runs = await pool.map<ReturnType<typeof endlessSeedRuns>>('reportEndless', seeds.map((s) => [s]));
  const searched = await pool.map<ReturnType<typeof endlessSearchRun>>('reportSearch', seeds.slice(0, sizes.search).map((s) => [s]));
  const augmentSeeds = seeds.slice(0, sizes.augment);
  const cardArgs: [number, boolean, number][] = [];
  for (const card of AUGMENTS) for (const force of [true, false]) for (const s of augmentSeeds) cardArgs.push([card.id, force, s]);
  const cardWaves = await pool.map<number>('reportCard', cardArgs);
  const per = augmentSeeds.length;
  const augments = AUGMENTS.map((card, c) => {
    const forced = mean(cardWaves.slice(c * 2 * per, c * 2 * per + per));
    const banned = mean(cardWaves.slice(c * 2 * per + per, (c + 1) * 2 * per));
    return { card: card.id, forced, banned, delta: forced - banned };
  });
  const best = searched.reduce((a, b) => (b.cleared > a.cleared ? b : a), searched[0]);
  const invested = best ? best.invested : TOWERS.map(() => 0);
  const total = invested.reduce((a, b) => a + b, 0) || 1;
  return {
    greedyValue: runs.map((r) => r.value),
    greedyRandom: runs.map((r) => r.random),
    earlyCall: { waves: runs.map((r) => r.earlyWaves), minutes: runs.map((r) => r.earlyEndTick / 1800) },
    search: searched.map((r) => r.cleared),
    augments,
    diversity: invested.map((x) => x / total),
  };
}

// ==================== 마크다운 ====================

const yes = (b: boolean) => (b ? '✓' : '✗');
const band = (ok: boolean) => (ok ? '' : ' ⚠');

export function reportMarkdown(campaign: StageRow[], endless: EndlessReport, weekly: { evaluated: number; allowed: number; impacts: number[] } | null, sizes: ReportSizes): string {
  const L: string[] = [];
  L.push('## 캠페인 (보통 기준 — §L8 대역: 기준 봇 ≥95% · 초보 40~70% · 어려움 기준 봇 50~80%)');
  L.push('');
  L.push(`| 스테이지 | 웨이브 | 기준 봇 쉬움/보통/어려움 | 남은 목숨 | 초보 봇 쉬움/보통/어려움 (${sizes.novice}시드) | 각본 | 판 길이(분, 1×) | 미사용 골드 최대 |`);
  L.push('|---|---|---|---|---|---|---|---|');
  for (const r of campaign) {
    const n = r.novice;
    L.push(
      `| ${r.id.toUpperCase()} | ${r.waves} | ${yes(r.greedy.easy)}/${yes(r.greedy.normal)}/${yes(r.greedy.hard)} | ${r.greedy.lives} | ${pct(n.easy)}/${pct(n.normal)}${band(n.normal >= 0.4 && n.normal <= 0.7)}/${pct(n.hard)} | ${yes(r.scripted)} | ${r.minutes.toFixed(1)} | ${pct(r.unusedGoldMax)}${band(r.unusedGoldMax <= 0.3)} |`,
    );
  }
  L.push('');
  L.push('### 실측 여유도 k_crit ‰ (웨이브별 — 보통·기준 봇이 누수 0으로 막는 최대 HP 배율, 목표 M과 비교) · 최대 진행률 ‰ · 초보 봇 평균 잃은 목숨');
  L.push('');
  for (const r of campaign) {
    L.push(`- ${r.id.toUpperCase()} k_crit: ${r.kCrit.join(' · ')}`);
    L.push(`  - 최대 진행률: ${r.maxProgress.join(' · ')} / 초보 누수: ${r.noviceLeaks.join(' · ')}`);
  }
  L.push('');
  L.push('## 무한 (§L8: 기준 봇(증강 무작위) 붕괴 28~35 · 탐색 봇 벽 40~50 · 증강 운 편차 σ ≤ 3 · 증강 지배 +5 초과 경보)');
  L.push('');
  const row = (name: string, xs: number[]) =>
    `| ${name} | ${xs.length} | ${mean(xs).toFixed(1)} | ${median(xs)} | ${sd(xs).toFixed(1)} | ${Math.min(...xs)}~${Math.max(...xs)} |`;
  L.push('| 봇 | 판 수 | 평균 붕괴 웨이브 | 중앙값 | σ | 범위 |');
  L.push('|---|---|---|---|---|---|');
  L.push(row('기준 봇 · 증강 무작위', endless.greedyRandom));
  L.push(row('기준 봇 · 증강 가치표', endless.greedyValue));
  L.push(row('기준 봇 · 조기 호출', endless.earlyCall.waves));
  L.push(row('탐색 봇', endless.search));
  L.push('');
  const minutes = endless.earlyCall.minutes;
  L.push(`- 조기 호출 판 길이: 평균 ${mean(minutes).toFixed(1)}분(1×) = ${(mean(minutes) / 3).toFixed(1)}분(3×)`);
  const top = [...endless.augments].sort((a, b) => b.delta - a.delta);
  L.push(`- 증강 지배도(반드시 고름 − 안 고름, ${sizes.augment}시드): 상위 ${top.slice(0, 5).map((a) => `#${a.card + 1} ${a.delta >= 0 ? '+' : ''}${a.delta.toFixed(1)}`).join(' · ')} / 하위 ${top.slice(-3).map((a) => `#${a.card + 1} ${a.delta.toFixed(1)}`).join(' · ')}${band(top[0].delta <= 5)}`);
  L.push(`- 탐색 봇 최상위 판 타워 투자 비중: ${TOWERS.map((t, i) => `${['궁수', '대포', '마법', '서리', '석궁', '테슬라'][i]} ${pct(endless.diversity[i])}`).join(' · ')}${band(Math.max(...endless.diversity) <= 0.6)}`);
  if (weekly) {
    L.push('');
    L.push('## 주간 허용 (맵, 조합) 쌍 재검증 (§S5 대역 900~1300‰ — 생성과 다른 seed로 표본 쌍을 다시 잼)');
    L.push('');
    const sorted = [...weekly.impacts].sort((a, b) => a - b);
    L.push(`- 표본 ${weekly.evaluated}쌍 · 대역 안 ${weekly.allowed}쌍 · 영향 분포 최소 ${sorted[0]} · 하위 25% ${sorted[Math.floor(sorted.length / 4)]} · 중앙 ${median(sorted)} · 상위 25% ${sorted[Math.floor((sorted.length * 3) / 4)]} · 최대 ${sorted[sorted.length - 1]}`);
  }
  return L.join('\n');
}
