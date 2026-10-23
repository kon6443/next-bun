/**
 * 시뮬레이터 — 레벨링 설계 입력 (defense DESIGN §L2·§L3·§L6) — 스테이지별 적 풀·여유 배율·역할 목표 M
 * 캠페인 웨이브 구성은 엔진 구성기(composeWave)를 스테이지 고정 seed로 돌린 결과를 정수 데이터로 확정한다
 */

import {
  ENEMY_ID,
  ROLE,
  RNG_PURPOSE,
  type Wave,
  type WavePool,
  composeWave,
} from '../../engine';
import { streamSeed } from '../../engine/random';
import type { GameMap } from '../../engine';

/** 역할별 기본 여유도 M_base (§L3) */
export const M_BASE: readonly number[] = [1.5, 1.35, 1.25, 2.0, 1.15];

/** 캠페인 스테이지 설계 (§L2·§L3) — 역할 배열(웨이브 수 = 길이, 마지막은 보스)·여유 배율 X·이 스테이지까지 나온 적·이번에 새로 나오는 적 */
export type CampaignDesign = { roles: readonly number[]; x: number; enemies: readonly number[]; debut: readonly number[] };

const { BASIC: B, PLUS: P, RUSH: R, REST: Z, BOSS: K } = ROLE;
/** 6 · 8 · 10 · 12웨이브 역할 배열 — 기본·기본+·러시·휴식 주기, 보스는 중간 보스(10웨이브 이상)와 마지막만 (§L3 예: S1 기본·기본+·러시·휴식·기본+·보스) */
const ROLES_6 = [B, P, R, Z, P, K];
const ROLES_8 = [B, P, R, Z, B, P, R, K];
const ROLES_10 = [B, P, R, Z, K, B, P, R, Z, K];
const ROLES_12 = [B, P, R, Z, K, B, P, R, Z, P, R, K];

const E = ENEMY_ID;
const S1 = [E.GRUNT, E.RUNNER];
const S2 = [...S1, E.SHIELD];
const S3 = [...S2, E.SPLITTER];
const S4 = [...S3, E.BATS];
const S5 = [...S4, E.SUMMONER];
const S6 = [...S5, E.GHOST, E.WYVERN];
const S7 = [...S6, E.PRIEST, E.GIANT];
const S8 = [...S7, E.DRAGON];

export const CAMPAIGN_DESIGN: readonly CampaignDesign[] = [
  { roles: ROLES_6, x: 1.6, enemies: S1, debut: [] },
  { roles: ROLES_8, x: 1.45, enemies: S2, debut: [E.SHIELD] },
  { roles: ROLES_8, x: 1.3, enemies: S3, debut: [E.SPLITTER] },
  { roles: ROLES_8, x: 1.35, enemies: S4, debut: [E.BATS] },
  { roles: ROLES_10, x: 1.1, enemies: S5, debut: [] },
  { roles: ROLES_10, x: 1.15, enemies: S6, debut: [E.GHOST, E.WYVERN] },
  { roles: ROLES_10, x: 1.0, enemies: S7, debut: [E.PRIEST, E.GIANT] },
  { roles: ROLES_12, x: 0.85, enemies: S8, debut: [] },
];

/** 목표 여유도 M = 1 + (M_base − 1) × X */
export function targetMargin(role: number, x: number): number {
  return 1 + (M_BASE[role] - 1) * x;
}

/** 무한 기준 봇 붕괴 구간 — 설계 웨이브 이 웨이브 다음(25)부터 목표 M을 1 → ENDLESS_LAST_MARGIN으로 내린다 (D-029 (B)) */
export const ENDLESS_SQUEEZE_FROM = 24;
/** 마지막 설계 웨이브(30)의 목표 M — 1 미만이면 기준 봇이 이 구간에서 무너진다(§L8 28~35) */
export const ENDLESS_LAST_MARGIN = 0.92;

/** 무한 설계 웨이브의 여유 배율 — 1~24: 1.6 → 0.9 선형 (§L6) */
export function endlessX(n: number): number {
  return 1.6 - (0.7 * Math.min(n - 1, ENDLESS_SQUEEZE_FROM - 1)) / (ENDLESS_SQUEEZE_FROM - 1);
}

/**
 * 무한 설계 웨이브 n의 목표 M — 1~24는 역할별 M(X), 25~30은 역할과 무관하게 1.00 → ENDLESS_LAST_MARGIN 직선
 * (역할 차이는 임계 압력이 이미 담고 있다 — 25는 기준 봇이 겨우 막고 26~30은 점점 못 막아 이 구간에서 무너진다)
 * 31+ 램프는 탐색 봇 벽 40~50에 맞춘다(D-029 (B))
 */
export function endlessMargin(n: number, role: number): number {
  if (n <= ENDLESS_SQUEEZE_FROM) return targetMargin(role, endlessX(n));
  const t = (n - ENDLESS_SQUEEZE_FROM - 1) / (30 - ENDLESS_SQUEEZE_FROM - 1);
  const margin = 1 + (ENDLESS_LAST_MARGIN - 1) * t;
  if (margin <= 0) throw new Error(`무한 목표 M이 0 이하: 웨이브 ${n}`);
  return margin;
}

const only = (ids: readonly number[], allowed: readonly number[]) => ids.filter((id) => allowed.includes(id));

/** 스테이지 웨이브 n의 후보 — 새 적은 각자 첫 등장 웨이브에 단독으로 소개되고 그 뒤로 섞인다(§L0-4). 보스는 S5~(S8 최종 = 용) */
export function campaignPool(stage: number, n: number): WavePool {
  const design = CAMPAIGN_DESIGN[stage];
  const debuts = debutWaves(stage);
  const debutIndex = debuts.indexOf(n);
  const last = n === design.roles.length;
  const bosses = stage === 7 && last ? [E.DRAGON] : design.enemies.includes(E.SUMMONER) ? [E.SUMMONER] : [];
  if (debutIndex >= 0) {
    const solo = [design.debut[debutIndex]];
    return { main: solo, tank: solo, rush: solo, rest: solo, escort: solo, boss: bosses };
  }
  const allowed = design.enemies.filter((id) => {
    const i = design.debut.indexOf(id);
    return i < 0 || n > debuts[i];
  });
  const rest = only([E.GRUNT, E.RUNNER], allowed);
  return {
    main: only([E.GRUNT, E.SHIELD, E.GHOST, E.WYVERN, E.PRIEST, E.BATS], allowed),
    tank: only([E.SHIELD, E.GIANT], allowed),
    rush: only([E.RUNNER, E.BATS, E.SPLITTER], allowed),
    rest: rest.length > 0 ? rest : allowed.slice(0, 1),
    escort: only([E.GRUNT, E.RUNNER, E.SHIELD], allowed),
    boss: bosses,
  };
}

/** 새 적의 첫 등장 웨이브 — 2웨이브 이후 비보스·비휴식 웨이브를 차례로 하나씩 (한 웨이브에 새 기믹 1개, §L3-5) */
export function debutWaves(stage: number): number[] {
  const design = CAMPAIGN_DESIGN[stage];
  const out: number[] = [];
  for (let n = 2; n < design.roles.length && out.length < design.debut.length; n++) {
    const role = design.roles[n - 1];
    if (role !== ROLE.BOSS && role !== ROLE.REST) out.push(n);
  }
  return out;
}

/**
 * 캠페인 웨이브 n 구성 — 스테이지·웨이브·변형 번호 고정 seed라 압력만 바꿔 다시 만들 수 있다
 * variant: 기준 봇이 어떤 HP로도 못 막는 구성(마리 수·공중 조합 문제)이면 다음 변형으로 다시 뽑는다
 */
export function campaignWave(stage: number, map: GameMap, n: number, pressure: number, variant = 0): Wave {
  const design = CAMPAIGN_DESIGN[stage];
  const role = design.roles[n - 1];
  const rng = { state: streamSeed(1000 * (stage + 1) + n + 100000 * variant, RNG_PURPOSE.WAVE) };
  const options = { groundPaths: map.groundPaths.length, hasAirPath: map.airPaths.length > 0, airDouble: false, bossEscort: false };
  return composeWave(n, role, pressure, campaignPool(stage, n), options, rng);
}
