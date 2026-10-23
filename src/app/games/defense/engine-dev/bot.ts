/**
 * 개발 도구 — 탐욕 봇: 빈 슬롯에 타워를 짓고, 남으면 가장 낮은 레벨부터 업그레이드(Lv3에서는 분기)한다
 * 증강 제시가 오면 정해진 순번 카드를 고른다 (§S 시뮬레이터 봇 4종의 축소판 — 골든·성능 측정용 실제 판을 만든다)
 */

import { OP, branchCost, upgradeCost } from '../engine';
import type { GameDriver } from './driver';

export type BotOptions = {
  /** 카운트다운이 이 틱보다 많이 남았으면 조기 호출 (0 = 안 함) */
  earlyCallAbove?: number;
  /** 지을 슬롯 수 상한 */
  maxTowers?: number;
  /** 업그레이드하지 않는다 */
  noUpgrade?: boolean;
  /** 슬롯 순서대로 돌려 지을 타워 종류 (기본 = 스테이지 첫 타워). 지을 수 없는 종류(금지 등)는 건너뛴다 */
  kinds?: readonly number[];
  /** Lv3 → Lv4 분기 (0·1, 기본 0) */
  branch?: number;
  /** 증강 후보 중 고를 순번 (기본 0, 후보가 적으면 마지막) */
  pick?: number;
};

/** 틱마다 한 번 — 증강을 고르고, 살 수 있는 만큼 사고, 필요하면 웨이브를 부른다 */
export function botTurn(driver: GameDriver, options: BotOptions = {}): void {
  const { state, stage } = driver;
  while (state.augmentPending) {
    driver.must(OP.PICK_AUGMENT, Math.min(options.pick ?? 0, state.augmentChoices.length - 1));
  }
  const maxTowers = options.maxTowers ?? stage.map.slots.length;
  const kinds = options.kinds ?? [stage.towers[0]];
  for (let slot = 0; slot < stage.map.slots.length && state.towers.length < maxTowers; slot++) {
    if (state.towers.some((t) => t.slot === slot)) continue;
    let built = false;
    for (let k = 0; k < kinds.length && !built; k++) built = driver.command(OP.BUILD, slot, kinds[(slot + k) % kinds.length]);
    if (!built && state.gold < 200) break;
  }
  const branch = options.branch ?? 0;
  for (; !options.noUpgrade; ) {
    let best = -1;
    let bestLevel = Infinity;
    for (const tower of state.towers) {
      const cost = tower.level === 3 ? branchCost(state, tower.slot, branch) : upgradeCost(state, tower.slot);
      if (cost > 0 && cost <= state.gold && tower.level < bestLevel) {
        best = tower.slot;
        bestLevel = tower.level;
      }
    }
    if (best < 0) break;
    const ok = bestLevel === 3 ? driver.command(OP.BRANCH, best, branch) : driver.command(OP.UPGRADE, best);
    if (!ok) break;
  }
  if (state.wavesStarted === 0) driver.command(OP.CALL_WAVE);
  else if (options.earlyCallAbove && state.countdown > options.earlyCallAbove) driver.command(OP.CALL_WAVE);
}

/** 판이 끝날 때까지 봇으로 플레이 */
export function playWithBot(driver: GameDriver, options: BotOptions = {}, maxTicks = 162000): void {
  for (let i = 0; i < maxTicks && !driver.state.over; i++) {
    botTurn(driver, options);
    driver.run(1);
  }
}
