/**
 * 개발 도구 — 탐욕 봇: 빈 슬롯에 첫 타워를 짓고, 남으면 가장 낮은 레벨부터 업그레이드한다
 * (§S 시뮬레이터 봇 4종의 축소판 — 골든·성능 측정용 실제 판을 만든다)
 */

import { OP, upgradeCost } from '../engine';
import type { GameDriver } from './driver';

export type BotOptions = {
  /** 카운트다운이 이 틱보다 많이 남았으면 조기 호출 (0 = 안 함) */
  earlyCallAbove?: number;
  /** 지을 슬롯 수 상한 */
  maxTowers?: number;
  /** 업그레이드하지 않는다 */
  noUpgrade?: boolean;
};

/** 틱마다 한 번 — 살 수 있는 만큼 사고, 필요하면 웨이브를 부른다 */
export function botTurn(driver: GameDriver, options: BotOptions = {}): void {
  const { state, stage } = driver;
  const maxTowers = options.maxTowers ?? stage.map.slots.length;
  const kind = stage.towers[0];
  for (let slot = 0; slot < stage.map.slots.length && state.towers.length < maxTowers; slot++) {
    if (state.towers.some((t) => t.slot === slot)) continue;
    if (!driver.command(OP.BUILD, slot, kind)) break;
  }
  for (; !options.noUpgrade; ) {
    let best = -1;
    let bestLevel = Infinity;
    for (const tower of state.towers) {
      const cost = upgradeCost(state, tower.slot);
      if (cost > 0 && cost <= state.gold && tower.level < bestLevel) {
        best = tower.slot;
        bestLevel = tower.level;
      }
    }
    if (best < 0 || !driver.command(OP.UPGRADE, best)) break;
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
