/**
 * 시뮬레이터 봇 (defense DESIGN §S2) — 상태를 읽고 명령만 낸다(엔진과 같은 applyCommand — GameDriver가 기록)
 *   기준(Greedy): 결정적. 골드가 되는 대로 "골드당 실효 화력"이 가장 큰 구매(건설·업그레이드·분기)를 반복
 *     다가오는 웨이브에 공중이 있고 공중 화력 비중이 공중 HP 비중보다 작으면 공중 화력을 늘리는 구매만 고른다
 *     실효 화력 = 환산 DPS × 경로 커버(지상·공중을 다가오는 적 HP 비중으로) × (1 − 저항) — value.ts
 *   초보(Novice): 무작위 슬롯·타워·분기, 업그레이드는 골드가 넘칠 때만, 조기 호출 안 함 — 봇 전용 난수
 *   각본(Scripted): 스테이지별 빌드 순서(scripts.ts)를 골드가 되는 대로 차례로
 *   탐색(Search): search.ts (기준 봇 변형을 웨이브 단위로 빔 서치)
 * 봇 난수는 엔진 스트림을 쓰지 않는다(§S1)
 */

import {
  AUGMENTS,
  OP,
  RARITY,
  TOWERS,
  type GameState,
  branchCost,
  buildCost,
  slotAvailable,
  towerAllowed,
  upgradeCost,
  maxLevel,
} from '../../engine';
import type { GameDriver } from '../driver';
import { type Threat, convertedDps, effectiveness, upcomingThreat } from './value';

export type Bot = {
  name: string;
  /** 매 틱 한 번 — 명령만 낸다 */
  act(driver: GameDriver): void;
};

/** 봇 전용 난수 (mulberry32 → [0, 1)) */
export function botRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Purchase = { op: number; a: number; b: number; cost: number; value: number; airGain: number };

/** 지금 타워들의 지상·공중 실효 화력 (경로 커버 반영) */
function capability(state: GameState): { ground: number; air: number } {
  let ground = 0;
  let air = 0;
  for (const t of state.towers) {
    const dps = convertedDps(t.kind, t.level, t.branch);
    ground += dps * effectiveness(state, t.slot, t.kind, t.level, t.branch, GROUND_ONLY);
    air += dps * effectiveness(state, t.slot, t.kind, t.level, t.branch, AIR_ONLY);
  }
  return { ground, air };
}

const GROUND_ONLY: Threat = { ground: 1, air: 0, resistPhy: 0, resistMag: 0 };
const AIR_ONLY: Threat = { ground: 0, air: 1, resistPhy: 0, resistMag: 0 };

/** 공중 화력 부족 — 다가오는 적의 공중 HP 비중보다 공중 화력 비중이 작다 (§S2 "대공 우선") */
function airDeficit(state: GameState, threat: Threat): boolean {
  if (threat.air <= 0) return false;
  const cap = capability(state);
  return cap.air < threat.air * (cap.air + cap.ground);
}

/** 살 수 있는 구매 후보 (골드 무관) — 가치 = 늘어나는 실효 화력 / 비용 */
function purchases(state: GameState, threat: Threat): Purchase[] {
  const stage = state.board;
  const out: Purchase[] = [];
  const top = maxLevel(state, stage);
  for (let slot = 0; slot < stage.map.slots.length; slot++) {
    const tower = state.towers.find((t) => t.slot === slot);
    if (!tower) {
      if (!slotAvailable(state, stage, slot)) continue;
      for (const kind of stage.towers) {
        if (!towerAllowed(state, stage, kind)) continue;
        const cost = buildCost(state, kind);
        const gain = convertedDps(kind, 1, 0) * effectiveness(state, slot, kind, 1, 0, threat);
        const airGain = convertedDps(kind, 1, 0) * effectiveness(state, slot, kind, 1, 0, AIR_ONLY);
        out.push({ op: OP.BUILD, a: slot, b: kind, cost, value: gain / Math.max(1, cost), airGain });
      }
      continue;
    }
    const now = convertedDps(tower.kind, tower.level, tower.branch) * effectiveness(state, slot, tower.kind, tower.level, tower.branch, threat);
    const nowAir = convertedDps(tower.kind, tower.level, tower.branch) * effectiveness(state, slot, tower.kind, tower.level, tower.branch, AIR_ONLY);
    if (tower.level === 3) {
      if (top < 4) continue;
      for (let b = 0; b < 2; b++) {
        const cost = branchCost(state, slot, b);
        if (cost <= 0) continue;
        const next = convertedDps(tower.kind, 4, b + 1) * effectiveness(state, slot, tower.kind, 4, b + 1, threat);
        const nextAir = convertedDps(tower.kind, 4, b + 1) * effectiveness(state, slot, tower.kind, 4, b + 1, AIR_ONLY);
        out.push({ op: OP.BRANCH, a: slot, b, cost, value: (next - now) / cost, airGain: nextAir - nowAir });
      }
      continue;
    }
    const cost = upgradeCost(state, slot);
    if (cost <= 0) continue;
    const next = convertedDps(tower.kind, tower.level + 1, tower.branch) * effectiveness(state, slot, tower.kind, tower.level + 1, tower.branch, threat);
    const nextAir = convertedDps(tower.kind, tower.level + 1, tower.branch) * effectiveness(state, slot, tower.kind, tower.level + 1, tower.branch, AIR_ONLY);
    out.push({ op: OP.UPGRADE, a: slot, b: 0, cost, value: (next - now) / cost, airGain: nextAir - nowAir });
  }
  return out;
}

/** 증강 카드 가치 — 관련 타워 투자 비중 × 기본 이득 (가치 표 §S2) */
export function augmentValue(state: GameState, cardId: number): number {
  const card = AUGMENTS[cardId];
  const invested = state.towers.reduce((sum, t) => sum + t.invested, 0) || 1;
  const share = card.towers.length === 0 ? 1 : state.towers.filter((t) => card.towers.includes(t.kind)).reduce((sum, t) => sum + t.invested, 0) / invested;
  // 목숨은 스테이지 목숨으로 자른 값 — 보정 판(목숨 크게)에서 목숨이 넉넉하다고 카드 20을 늘 고르지 않게
  // (보정 판은 누수가 나도 이 값이 줄지 않는다 — 첫 누수 전까지만 실제 판과 같은 판단인 근사)
  const lives = Math.min(state.lives, state.board.lives);
  const base: Record<number, number> = {
    17: 0.12, 18: 0.08, 19: 0.03, 20: lives > 10 ? 0.12 : 0, 21: 0.18, 22: 0.05, 23: 0.1, 16: 0.2,
  };
  if (card.towers.length === 0) return base[cardId] ?? 0.1;
  const legendary = card.rarity === RARITY.LEGENDARY ? 2 : card.rarity === RARITY.RARE ? 1.3 : 1;
  return 0.2 * share * legendary;
}

function callWaves(driver: GameDriver, earlyCall: boolean): void {
  const state = driver.state;
  if (state.wavesStarted === 0) driver.command(OP.CALL_WAVE);
  else if (earlyCall && state.countdown > 0) driver.command(OP.CALL_WAVE);
}

export type GreedyOptions = {
  /** 카운트다운 즉시 호출 (무한 시간 지표 변형) */
  earlyCall?: boolean;
  /** 증강 — 가치 표 최댓값(기본) 또는 무작위 */
  augment?: 'value' | 'random';
  /** 탐색 봇 변형: 가치에 곱하는 교란(0 = 없음)과 그 난수 */
  noise?: number;
  random?: () => number;
  /** 판단 주기(틱) */
  every?: number;
};

/** 기준 봇 — 골드가 되는 대로 가장 효율 좋은 구매를 반복한다 */
export function greedyBot(options: GreedyOptions = {}): Bot {
  const every = options.every ?? 5;
  const random = options.random ?? botRandom(1);
  return {
    name: options.earlyCall ? 'greedy-early' : 'greedy',
    act(driver) {
      const state = driver.state;
      if (state.over) return;
      while (state.augmentPending) {
        const choices = state.augmentChoices;
        let pick = 0;
        if (options.augment === 'random') pick = Math.floor(random() * choices.length);
        else for (let i = 1; i < choices.length; i++) if (augmentValue(state, choices[i]) > augmentValue(state, choices[pick])) pick = i;
        driver.must(OP.PICK_AUGMENT, pick);
      }
      if (state.tick % every === 0) {
        const threat = upcomingThreat(state, driver.preview);
        for (let guard = 0; guard < 40; guard++) {
          let options2 = purchases(state, threat).filter((p) => p.cost <= state.gold && p.value > 0);
          // 공중 화력이 모자라면 공중 화력을 늘리는 구매만 (살 수 있는 게 있을 때)
          if (airDeficit(state, threat)) {
            const air = options2.filter((p) => p.airGain > 0);
            if (air.length > 0) options2 = air.map((p) => ({ ...p, value: p.airGain / p.cost }));
          }
          if (options2.length === 0) break;
          let best = options2[0];
          let bestValue = best.value * (options.noise ? 1 + options.noise * (random() - 0.5) : 1);
          for (let i = 1; i < options2.length; i++) {
            const v = options2[i].value * (options.noise ? 1 + options.noise * (random() - 0.5) : 1);
            if (v > bestValue) {
              best = options2[i];
              bestValue = v;
            }
          }
          if (!driver.command(best.op, best.a, best.b)) break;
        }
      }
      callWaves(driver, options.earlyCall ?? false);
    },
  };
}

/** 초보 봇 — 무작위 배치, 넘칠 때만 업그레이드, 조기 호출 안 함 */
export function noviceBot(seed: number): Bot {
  const random = botRandom(seed);
  const pickOf = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
  return {
    name: 'novice',
    act(driver) {
      const state = driver.state;
      if (state.over) return;
      while (state.augmentPending) driver.must(OP.PICK_AUGMENT, Math.floor(random() * state.augmentChoices.length));
      if (state.tick % 30 === 0) {
        const stage = state.board;
        const empty: number[] = [];
        for (let slot = 0; slot < stage.map.slots.length; slot++) {
          if (!state.towers.some((t) => t.slot === slot) && slotAvailable(state, stage, slot)) empty.push(slot);
        }
        const kinds = stage.towers.filter((k) => towerAllowed(state, stage, k));
        if (empty.length > 0 && random() < 0.7) {
          const kind = pickOf(kinds);
          if (state.gold >= buildCost(state, kind)) driver.command(OP.BUILD, pickOf(empty), kind);
        } else if (state.towers.length > 0) {
          const tower = pickOf(state.towers);
          if (tower.level === 3) {
            const b = Math.floor(random() * 2);
            const cost = branchCost(state, tower.slot, b);
            if (cost > 0 && state.gold >= 2 * cost) driver.command(OP.BRANCH, tower.slot, b);
          } else {
            const cost = upgradeCost(state, tower.slot);
            if (cost > 0 && state.gold >= 2 * cost) driver.command(OP.UPGRADE, tower.slot);
          }
        }
      }
      callWaves(driver, false);
    },
  };
}

/** 각본 한 줄 — 건설(slot, kind) · 업그레이드(slot) · 분기(slot, 0·1) */
export type ScriptStep = { op: number; a: number; b?: number };

/** 각본 봇 — 각본을 차례로, 골드가 될 때까지 기다린다(거부되는 줄은 건너뛴다) */
export function scriptedBot(script: readonly ScriptStep[]): Bot {
  let next = 0;
  return {
    name: 'scripted',
    act(driver) {
      const state = driver.state;
      if (state.over) return;
      while (state.augmentPending) driver.must(OP.PICK_AUGMENT, 0);
      for (let guard = 0; guard < 10 && next < script.length; guard++) {
        const s = script[next];
        const cost =
          s.op === OP.BUILD ? buildCost(state, s.b ?? 0) : s.op === OP.BRANCH ? branchCost(state, s.a, s.b ?? 0) : upgradeCost(state, s.a);
        if (cost > 0 && state.gold < cost) break; // 모일 때까지 기다린다
        driver.command(s.op, s.a, s.b ?? 0);
        next++;
      }
      callWaves(driver, false);
    },
  };
}

/** 타워 종류 수 — 보고서 타워 다양성용 */
export const TOWER_KIND_COUNT = TOWERS.length;
