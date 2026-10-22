/**
 * 시뮬레이터 — 웨이브 생성 (defense DESIGN §S3 용도 ①) — 임계 배율로 압력을 역산한다
 *   웨이브 n 시작 직전 스냅샷에서 압력 p로 웨이브 n만 돌려 "기준 봇이 누수 0으로 막는 최대 p"(p_crit)를 이분 탐색하고
 *   확정 압력 = p_crit / 목표 M. 확정한 웨이브로 n을 실제로 진행한 뒤 n+1로 (실측 여유도 = p_crit / 확정 압력 = M)
 * 결과는 정수(압력·HP·마리)로 data/waves.ts에 쓴다
 */

import {
  CAMPAIGN_STAGES,
  DESIGNED_WAVES,
  MAP_ENDLESS,
  MAX_WAVE,
  RNG_PURPOSE,
  type Stage,
  type Wave,
  composeWave,
  endlessPool,
  endlessPressure,
  endlessStage,
  generateEndlessWaves,
  roleOfWave,
} from '../../engine';
import { streamSeed } from '../../engine/random';
import { GameDriver } from '../driver';
import { type Bot, botRandom, greedyBot } from './bots';
import { CAMPAIGN_DESIGN, campaignWave, endlessMargin, targetMargin } from './design';
import { runGame, runToWaveStart } from './runner';
import { PREVIEW_AHEAD } from './value';
import type { SimPool } from './pool';
import { type SearchOptions, type SearchState, searchAdvance, searchBegin, searchBest, searchPlay } from './search';

/**
 * 스냅샷에서 웨이브 n만 wave로 바꿔 그 웨이브가 끝날 때까지 돌린다 — 웨이브 n에서 샌 적이 0이면 true
 * 보드는 웨이브 n까지 잘라 다음 웨이브가 자동 시작되지 않게 하고(판정이 뒤 웨이브·압력 추정값에 흔들리지 않게),
 * 봇의 웨이브 미리보기는 판 보드 웨이브 그대로 넘긴다 — 구성은 실제 판과 같고, 아직 확정 전인 웨이브의 압력은 보정 시작값이라
 * HP 가중 비율이 반올림만큼 다를 수 있다(입력이 같으면 결과는 같다 — 현재 waves.ts와는 무관, createEndlessRun)
 */
export function holds(snapshot: GameDriver, n: number, wave: Wave, bot: Bot): boolean {
  if (snapshot.state.over) return false;
  const trial = snapshot.clone();
  // 미리보기는 실제 판 웨이브(구성) 그대로, 보드는 웨이브 n까지만 — 뒤 웨이브가 시작되어 판정에 섞이지 않는다
  const board = trial.state.board;
  const preview = board.waves.slice();
  preview[n - 1] = wave;
  trial.preview = preview;
  trial.state.board = { ...board, waves: preview.slice(0, n) };
  const stat = runGame(trial, bot, (d) => d.state.waves[n - 1].cleared).waves[n - 1];
  return stat.startTick >= 0 && trial.state.waves[n - 1].cleared && stat.leaked === 0;
}

/** 누수 0으로 막는 최대 압력 — guess에서 두 배씩 넓힌 뒤 이분 탐색(상대 오차 2%) */
export function criticalPressure(passes: (pressure: number) => boolean, guess: number): number {
  let lo = 0;
  let hi = Math.max(2, guess);
  while (passes(hi)) {
    lo = hi;
    hi *= 2;
    if (hi > 1e8) return lo;
  }
  while (hi - lo > Math.max(1, lo * 0.02)) {
    const mid = Math.floor((lo + hi) / 2);
    if (passes(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function replaceWave(driver: GameDriver, n: number, wave: Wave): void {
  const board = driver.state.board;
  const waves = board.waves.slice();
  waves[n - 1] = wave;
  driver.state.board = { ...board, waves };
}

export type GeneratedStage = { pressures: number[]; criticals: number[]; variants: number[]; waves: Wave[] };

/** 어떤 HP로도 못 막는 구성의 변형을 몇 번까지 다시 뽑나 */
const MAX_VARIANTS = 8;

/** 캠페인 스테이지 하나 — 레벨링 모델 압력(guess)에서 시작 */
export function generateCampaignStage(stageIndex: number, guesses: readonly number[]): GeneratedStage {
  const design = CAMPAIGN_DESIGN[stageIndex];
  const base = CAMPAIGN_STAGES[stageIndex];
  const map = base.map;
  const count = design.roles.length;
  const initial: Wave[] = [];
  for (let n = 1; n <= count; n++) initial.push(campaignWave(stageIndex, map, n, guesses[n - 1]));
  const stage: Stage = { ...base, waves: initial };
  const driver = new GameDriver(stage, 1);
  const bot = greedyBot();
  const pressures: number[] = [];
  const criticals: number[] = [];
  const variants: number[] = [];
  for (let n = 1; n <= count; n++) {
    runToWaveStart(driver, bot, n);
    const snapshot = driver.clone();
    let variant = 0;
    let critical = 0;
    for (; variant < MAX_VARIANTS; variant++) {
      const v = variant;
      critical = criticalPressure((p) => holds(snapshot, n, campaignWave(stageIndex, map, n, p, v), bot), guesses[n - 1]);
      if (critical > 0) break;
    }
    if (critical === 0) throw new Error(`캠페인 생성: S${stageIndex + 1} 웨이브 ${n} — 변형 ${MAX_VARIANTS}개 모두 기준 봇이 HP 1로도 못 막는다`);
    const margin = targetMargin(design.roles[n - 1], design.x);
    const pressure = Math.max(1, Math.floor(critical / margin));
    pressures.push(pressure);
    criticals.push(critical);
    variants.push(variant);
    replaceWave(driver, n, campaignWave(stageIndex, map, n, pressure, variant));
  }
  return { pressures, criticals, variants, waves: driver.state.board.waves.slice() };
}

/** 무한 판 seed의 웨이브별 구성 난수 상태 — 구성기의 난수 소비는 압력과 무관해 압력만 바꿔 다시 만들 수 있다 */
function endlessRngStates(seed: number): number[] {
  const rng = { state: streamSeed(seed, RNG_PURPOSE.WAVE) };
  const options = { groundPaths: MAP_ENDLESS.groundPaths.length, hasAirPath: MAP_ENDLESS.airPaths.length > 0, airDouble: false, bossEscort: false };
  const states: number[] = [];
  for (let n = 1; n <= MAX_WAVE; n++) {
    states.push(rng.state);
    composeWave(n, roleOfWave(n, MAX_WAVE, false), 1, endlessPool(n), options, rng);
  }
  return states;
}

function endlessWave(seedStates: readonly number[], n: number, pressure: number): Wave {
  const options = { groundPaths: MAP_ENDLESS.groundPaths.length, hasAirPath: MAP_ENDLESS.airPaths.length > 0, airDouble: false, bossEscort: false };
  return composeWave(n, roleOfWave(n, MAX_WAVE, false), pressure, endlessPool(n), options, { state: seedStates[n - 1] });
}

/** 무한 보정 판 목숨 — 누수로 판이 끝나지 않을 만큼 */
const CALIBRATION_LIVES = 1_000_000;
/**
 * 보정은 증강 가치표 봇 — 증강 무작위 봇은 시험 판(복제)마다 난수 소비가 달라 이분 탐색의 통과 판정이 흔들린다
 * 대역 판정(endlessCollapse)은 §L8 기준대로 증강 무작위 봇이라, 두 봇의 차이는 대역 확인(generate.test)이 흡수한다
 * 이 봇은 상태가 없다(교란·무작위 증강 없음) — seed별 판을 어느 워커가 돌려도 같다
 */
const CALIBRATION_BOT = greedyBot();

/** 무한 보정 판 하나(seed) — 웨이브를 확정하며 이어 간다 */
export type EndlessRun = { driver: GameDriver; states: number[] };

/**
 * 보드 웨이브는 시작값(guesses — 보정 입력) 압력표로 채운다 — 현재 waves.ts에 기대면 아직 확정 전인 웨이브(봇 미리보기 n, n+1)의
 * HP 반올림이 생성 전 파일에 따라 달라져 재생성 결과가 파일에 의존한다. 확정한 웨이브는 endlessRunFix가 갈아 끼운다
 */
export function createEndlessRun(seed: number, guesses: readonly number[]): EndlessRun {
  const driver = new GameDriver({ ...endlessStage('endless-s1', seed), waves: endlessWavesOf(guesses, 1000, seed) }, seed, 'endless');
  // 보정 판은 목숨을 크게 둔다 — M < 1 구간(25~30)의 누수나 시험 판의 웨이브 중 누수로 seed가 표본에서 빠지거나 임계가 0으로 잡히지 않게
  // (봇의 카드 20 판단은 스테이지 목숨으로 자른 값을 본다 — bots.ts augmentValue. 보정 판에서는 누수가 나도 그 값이 줄지 않는 근사)
  // 붕괴는 endlessCollapse가 실제 목숨으로 따로 잰다
  driver.state.lives = CALIBRATION_LIVES;
  return { driver, states: endlessRngStates(seed) };
}

/** 웨이브 n 시작 직전까지 진행해 임계 압력 — 판이 앞에서 끝났으면 null(보정 목숨으로는 드물다 — 표본에서 뺀다) */
export function endlessRunCritical(run: EndlessRun, n: number, guess: number): number | null {
  runToWaveStart(run.driver, CALIBRATION_BOT, n);
  if (run.driver.state.over) return null;
  // 시험 판은 보드를 웨이브 n까지 자르고(holds), 미리보기의 미확정 웨이브는 시작값 압력표(createEndlessRun) — 현재 waves.ts와 무관
  const snapshot = run.driver.clone();
  return criticalPressure((p) => holds(snapshot, n, endlessWave(run.states, n, p), CALIBRATION_BOT), guess);
}

export function endlessRunFix(run: EndlessRun, n: number, pressure: number): void {
  replaceWave(run.driver, n, endlessWave(run.states, n, pressure));
}

/**
 * 무한 설계 웨이브 1~30 (§L6) — seed마다 구성(seed 스트림)이 달라 임계 압력이 출렁인다
 *   웨이브마다 seed들의 임계 압력 최솟값(HP 1로도 못 막는 seed·중앙값 1/3 미만 외톨이 제외) / M으로 확정하고 그 압력으로 모든 seed를 진행한다
 *   (표본 seed 전부가 기준 봇으로 막는 압력 — 분위수면 약한 구성 웨이브에서 판이 몰려 끝난다)
 * seed별 판은 워커에 묶어(pin) 웨이브마다 병렬로 재고, 집계는 seed 순서대로 한다(순차와 같은 결과)
 */
export async function generateEndlessDesigned(pool: SimPool, seeds: readonly number[], guesses: readonly number[], log: (line: string) => void = () => {}): Promise<{ pressures: number[]; criticals: number[][] }> {
  const pin = (i: number) => i;
  await pool.map('endlessOpen', seeds.map((seed) => [seed, guesses]), pin);
  const criticals: number[][] = [];
  const pressures: number[] = [];
  for (let n = 1; n <= DESIGNED_WAVES; n++) {
    const margin = endlessMargin(n, roleOfWave(n, MAX_WAVE, false));
    const measured = await pool.map<number | null>('endlessCritical', seeds.map((seed) => [seed, n, guesses[n - 1]]), pin);
    const perSeed = measured.filter((c): c is number => c !== null);
    if (perSeed.length === 0) throw new Error(`무한 생성: 웨이브 ${n} 전에 모든 seed가 끝났다`);
    criticals.push(perSeed);
    // HP 1로도 못 막는 seed(구성 탓 — 공중 카운터 부재 등)는 압력으로 조절할 수 없어 뺀다
    // 나머지 중 최솟값 — 구성(러시의 박쥐·질주병·분열체 등)마다 임계가 크게 달라 분위수면 약한 구성 웨이브에서 판이 몰려 끝난다
    // 중앙값의 1/3에 못 미치는 외톨이 seed도 뺀다(한 seed의 극단 구성이 웨이브 전체를 끌어내리지 않게)
    const positive = perSeed.filter((c) => c > 0).sort((a, b) => a - b);
    if (positive.length === 0) throw new Error(`무한 생성: 웨이브 ${n} — 모든 seed가 HP 1로도 못 막는다`);
    const median = positive[Math.floor(positive.length / 2)];
    const sorted = positive.filter((c) => c * 3 >= median);
    const pressure = Math.max(1, Math.floor(sorted[0] / margin));
    pressures.push(pressure);
    log(`무한 보정 웨이브 ${n}/${DESIGNED_WAVES} — 압력 ${pressure}`);
    await pool.map('endlessFix', seeds.map((seed) => [seed, n, pressure]), pin);
  }
  return { pressures, criticals };
}

/** 확정한 압력표로 무한 31+ 램프까지 포함한 웨이브 압력 (보고서용) */
export function endlessPressureTable(designed: readonly number[], rampPermille: number): number[] {
  const out: number[] = [];
  for (let n = 1; n <= MAX_WAVE; n++) out.push(endlessPressure(designed, n, rampPermille));
  return out;
}

const ENDLESS_COMPOSE = { groundPaths: MAP_ENDLESS.groundPaths.length, hasAirPath: MAP_ENDLESS.airPaths.length > 0, airDouble: false, bossEscort: false };

function endlessWavesOf(designed: readonly number[], rampPermille: number, seed: number): Wave[] {
  return generateEndlessWaves(designed, rampPermille, ENDLESS_COMPOSE, { state: streamSeed(seed, RNG_PURPOSE.WAVE) });
}

/** 무한 판(설계표·램프 배율 지정)을 기준 봇(증강 무작위 — §L8 기준)으로 끝까지 — 붕괴 웨이브(클리어한 웨이브 수) */
export function endlessCollapse(designed: readonly number[], rampPermille: number, seed: number): number {
  const driver = new GameDriver({ ...endlessStage('endless-s1', seed), waves: endlessWavesOf(designed, rampPermille, seed) }, seed, 'endless');
  return runGame(driver, greedyBot({ augment: 'random', random: botRandom(seed) })).wavesCleared;
}

/** 무한 판(설계표·램프 배율 지정)을 탐색 봇으로 끝까지 — 벽(클리어한 웨이브 수) */
export function endlessWall(designed: readonly number[], rampPermille: number, seed: number, options: SearchOptions = {}): number {
  const driver = new GameDriver({ ...endlessStage('endless-s1', seed), waves: endlessWavesOf(designed, rampPermille, seed) }, seed, 'endless');
  return searchPlay(driver, seed, options).state.wavesCleared;
}

/**
 * 탐색 봇 판의 램프 무관 앞부분 — 라운드가 설계 웨이브(1~30) 안만 플레이하고 봇 미리보기(진행 중 웨이브 다음 둘 — value.ts upcomingThreat)도
 * 30 안만 읽는 동안 진행한 빔 상태. 램프는 31웨이브부터라 이 앞부분은 어떤 램프에서도 같다. 램프 맞춤이 seed마다 한 번만 돈다
 * (미리보기는 HP 가중 비율이라 램프에 따라 반올림이 달라진다 — 그래서 31을 읽기 전 라운드에서 멈춘다)
 */
export function endlessWallPrefix(designed: readonly number[], seed: number, options: SearchOptions = {}): SearchState {
  const driver = new GameDriver({ ...endlessStage('endless-s1', seed), waves: endlessWavesOf(designed, 1000, seed) }, seed, 'endless');
  return searchAdvance(searchBegin(driver), seed, options, (reach) => reach + PREVIEW_AHEAD > DESIGNED_WAVES);
}

/** 앞부분(endlessWallPrefix)에서 램프만 바꿔 이어 간다 — endlessWall(designed, rampPermille, seed)와 같은 값 */
export function endlessWallFrom(prefix: SearchState, designed: readonly number[], rampPermille: number, seed: number, options: SearchOptions = {}): number {
  const waves = endlessWavesOf(designed, rampPermille, seed);
  const beams = prefix.beams.map((d) => {
    const copy = d.clone();
    copy.state.board = { ...copy.state.board, waves };
    return copy;
  });
  return searchBest(searchAdvance({ beams, round: prefix.round }, seed, options)).state.wavesCleared;
}

/** seed 목록의 탐색 봇 벽(seed 순서) — 병렬. seed마다 같은 워커에 묶어 램프 무관 앞부분을 다시 쓴다(jobs.ts) */
export function endlessWalls(pool: SimPool, designed: readonly number[], rampPermille: number, seeds: readonly number[]): Promise<number[]> {
  return pool.map<number>('endlessWallCached', seeds.map((seed) => [designed, rampPermille, seed]), (i) => i);
}

/** seed 목록의 기준 봇 붕괴 웨이브(seed 순서) — 병렬 */
export function endlessCollapses(pool: SimPool, designed: readonly number[], rampPermille: number, seeds: readonly number[]): Promise<number[]> {
  return pool.map<number>('endlessCollapse', seeds.map((seed) => [designed, rampPermille, seed]));
}

/**
 * 램프 배율 — 탐색 봇(상위 플레이어 추정) 벽 중앙값이 target이 되도록 이분 탐색(D-029 (B) — 기준 봇은 설계 웨이브 25~30에서 무너진다)
 * 중앙값은 웨이브 단위라 target을 내는 배율이 한 구간이다 — 처음 맞힌 값에서 멈추지 않고 구간 양 끝을 좁혀 기하 중앙을 고른다
 */
export async function fitRampSearch(
  pool: SimPool,
  designed: readonly number[],
  seeds: readonly number[],
  target: number,
  log: (line: string) => void = () => {},
): Promise<{ rampPermille: number; walls: number[] }> {
  let probes = 0;
  const median = async (ramp: number) => {
    const probe = ++probes; // 번호는 부를 때 정한다 — 두 끝을 같이 잴 때도 워커 수와 무관하게 같은 번호
    const walls = await endlessWalls(pool, designed, ramp, seeds);
    const list = walls.slice().sort((a, b) => a - b);
    log(`램프 탐침 ${probe} — ${ramp}‰ 벽 중앙값 ${list[Math.floor(list.length / 2)]}`);
    return { value: list[Math.floor(list.length / 2)], list };
  };
  const geoMid = (a: number, b: number) => Math.round(Math.sqrt(a * b));
  const LO = 50;
  const HI = 256000;
  /** 배율이 클수록 적이 세다 — 벽 > target이면 배율을 올린다 */
  let lo = LO;
  let hi = HI;
  let hit = -1;
  let best = { rampPermille: 1000, walls: [] as number[], miss: Infinity };
  for (let i = 0; i < 10 && hit < 0; i++) {
    const mid = geoMid(lo, hi);
    const m = await median(mid);
    const miss = Math.abs(m.value - target);
    if (miss < best.miss) best = { rampPermille: mid, walls: m.list, miss };
    if (miss === 0) hit = mid;
    else if (m.value > target) lo = mid;
    else hi = mid;
  }
  if (hit >= 0) {
    // 구간 아래 끝(lo~hit)과 위 끝(hit~hi)을 각각 4번씩 좁힌다 — 두 끝은 서로 독립이라 같이 잰다
    let low = hit;
    let lowOut = lo;
    let high = hit;
    let highOut = hi;
    for (let i = 0; i < 4; i++) {
      const a = geoMid(lowOut, low);
      const b = geoMid(high, highOut);
      const [ma, mb] = await Promise.all([median(a), median(b)]);
      if (ma.value === target) low = a;
      else lowOut = a;
      if (mb.value === target) high = b;
      else highOut = b;
    }
    const center = geoMid(low, high);
    const m = await median(center);
    best = m.value === target ? { rampPermille: center, walls: m.list, miss: 0 } : best;
  }
  // 탐색 범위 끝에 붙었으면 목표를 범위 안에서 못 맞춘 것 — 조용히 넘기지 않는다
  if (best.rampPermille * 2 > HI || best.rampPermille < LO * 2) throw new Error(`램프 맞춤이 탐색 범위 끝(${best.rampPermille}‰)에 닿았다 — 벽 ${best.walls.join(',')}`);
  return { rampPermille: best.rampPermille, walls: best.walls };
}

// ==================== data/waves.ts 쓰기 ====================

function waveText(wave: Wave): string {
  const groups = wave.groups.map((g) => `g(${g.enemyId}, ${g.count}, ${g.intervalTicks}, ${g.delayTicks}, ${g.hp}, ${g.path})`);
  return `{ groups: [${groups.join(', ')}] }`;
}

/** 생성 결과 → waves.ts 원문 (압력·실측 p_crit을 주석으로 남긴다) */
export function wavesFileText(stages: readonly GeneratedStage[], designed: readonly number[], rampPermille: number): string {
  const lines: string[] = [
    '/**',
    ' * 웨이브 데이터 — 시뮬레이터가 생성한다(engine-dev/sim — DEFENSE_SIM_WRITE=1). 손으로 다듬을 수 있지만 다시 생성하면 덮인다',
    ' * 캠페인: 그룹 g(적 id, 스폰 횟수, 간격 틱, 지연 틱, HP, 경로) · 주석 = 웨이브 압력(EHP/s) / 기준 봇 임계 압력',
    ' * 원본·동기화 규칙은 ../constants.ts 머리 주석',
    ' */',
    '',
    "import type { Wave, WaveGroup } from './stages';",
    '',
    'const g = (enemyId: number, count: number, intervalTicks: number, delayTicks: number, hp: number, path: number): WaveGroup => ({',
    '  enemyId, count, intervalTicks, delayTicks, hp, path,',
    '});',
    '',
    '/** 캠페인 8스테이지 웨이브 (인덱스 = 스테이지 − 1) */',
    'export const CAMPAIGN_WAVES: readonly (readonly Wave[])[] = [',
  ];
  stages.forEach((stage, s) => {
    lines.push(`  // S${s + 1}`);
    lines.push('  [');
    stage.waves.forEach((wave, i) => lines.push(`    ${waveText(wave)}, // ${i + 1}: ${stage.pressures[i]} / ${stage.criticals[i]}${stage.variants[i] > 0 ? ` (구성 변형 ${stage.variants[i]})` : ''}`));
    lines.push('  ],');
  });
  lines.push('];', '');
  lines.push('/** 무한·주간 설계 웨이브 1~30 압력(초당 유입 EHP) — seed들의 기준 봇 임계 압력 최솟값 / 목표 M */');
  lines.push('export const ENDLESS_DESIGNED_PRESSURE: readonly number[] = [');
  for (let i = 0; i < designed.length; i += 10) lines.push(`  ${designed.slice(i, i + 10).join(', ')},`);
  lines.push('];', '');
  lines.push('/** 무한 31+ 램프 단계 배율 ‰ — 탐색 봇(상위 플레이어 추정) 벽 중앙값이 목표 42(§L8 40~50 안 — 기준 봇 붕괴 28~35도 함께 맞는 쪽, generate.test RAMP_TARGET_WALL)가 되게 맞춘 값 (D-029) */');
  lines.push(`export const ENDLESS_RAMP_PERMILLE = ${rampPermille};`, '');
  return lines.join('\n');
}
