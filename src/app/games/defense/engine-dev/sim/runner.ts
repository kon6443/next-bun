/**
 * 시뮬레이터 헤드리스 러너 (defense DESIGN §S1) — 봇 명령 → applyCommand → step 반복(실제 플레이·서버 검증과 같은 함수)
 * 계측은 상태 읽기만 한다(엔진 무수정). 봇 판은 그대로 리플레이(명령 로그)라 simulateReplay로 다시 확인할 수 있다
 */

import { ENEMY_STATUS, EVENT, EVENT_STRIDE, MAX_TICKS, step } from '../../engine';
import type { GameDriver } from '../driver';
import type { Bot } from './bots';

export type WaveStat = {
  /** 이 웨이브에서 샌 적 수 (처치되지 않고 끝난 수) */
  leaked: number;
  /** 이 웨이브 적의 누수로 잃은 목숨 (§S4 누수 분포) */
  livesLost: number;
  /** 이 웨이브 적이 간 가장 먼 경로 진행률 ‰ */
  maxProgress: number;
  startTick: number;
  /** 끝난 틱 (−1 = 판이 끝날 때까지 안 끝남) */
  endTick: number;
  /** 끝난 순간 잔액 · 그때까지 누적 수입(시작 골드 + 번 골드) */
  goldAtEnd: number;
  incomeAtEnd: number;
};

export type GameResult = {
  victory: boolean;
  livesLeft: number;
  wavesCleared: number;
  wavesStarted: number;
  endTick: number;
  waves: WaveStat[];
  /** 타워 종류별 투자액 (판 끝 기준) */
  investedByKind: number[];
};

/** 판 하나를 봇으로 끝까지 (또는 until이 참이 될 때까지) */
export function runGame(driver: GameDriver, bot: Bot, until?: (driver: GameDriver) => boolean, maxTicks = MAX_TICKS): GameResult {
  const state = driver.state;
  const stats: WaveStat[] = state.board.waves.map(() => ({ leaked: 0, livesLost: 0, maxProgress: 0, startTick: -1, endTick: -1, goldAtEnd: 0, incomeAtEnd: 0 }));
  const startGold = state.gold;
  const events: number[] = [];
  /** 적 id → 웨이브 (누수 이벤트를 웨이브에 돌린다 — 샌 적은 같은 틱에 배열에서 빠진다) */
  const waveOf = new Map<number, number>();
  for (const e of state.enemies) waveOf.set(e.id, e.wave);
  for (let i = 0; i < maxTicks && !state.over; i++) {
    if (until && until(driver)) break;
    bot.act(driver);
    if (state.augmentPending) continue; // 봇이 고르지 않으면 멈춘다(봇 결함) — 무한 루프 방지는 maxTicks
    events.length = 0;
    step(state, events);
    for (let k = 0; k < events.length; k += EVENT_STRIDE) {
      if (events[k] === EVENT.SPAWN) {
        const enemy = state.enemies.find((e) => e.id === events[k + 1]);
        if (enemy) waveOf.set(enemy.id, enemy.wave);
      } else if (events[k] === EVENT.LEAK) {
        const wave = waveOf.get(events[k + 1]);
        if (wave !== undefined) {
          stats[wave - 1].livesLost += events[k + 2];
          stats[wave - 1].maxProgress = 1000;
        }
      }
    }
    for (const enemy of state.enemies) {
      if (enemy.status !== ENEMY_STATUS.ALIVE) continue;
      const stat = stats[enemy.wave - 1];
      const progress = Math.floor((enemy.dist * 1000) / enemy.pathTotal);
      if (progress > stat.maxProgress) stat.maxProgress = progress;
    }
    for (let w = 0; w < state.wavesStarted; w++) {
      const stat = stats[w];
      if (stat.startTick < 0) stat.startTick = state.tick;
      const progress = state.waves[w];
      if (stat.endTick < 0 && progress.cleared) {
        stat.endTick = state.tick;
        stat.leaked = progress.total - progress.kills;
        stat.goldAtEnd = state.gold;
        stat.incomeAtEnd = startGold + state.goldEarned;
      }
    }
  }
  for (let w = 0; w < state.wavesStarted; w++) {
    const stat = stats[w];
    if (stat.endTick < 0) stat.leaked = state.waves[w].total - state.waves[w].pending - state.waves[w].kills;
  }
  const investedByKind = [0, 0, 0, 0, 0, 0];
  for (const t of state.towers) investedByKind[t.kind] += t.invested;
  return {
    victory: state.victory,
    livesLeft: state.lives,
    wavesCleared: state.wavesCleared,
    wavesStarted: state.wavesStarted,
    endTick: state.over ? state.endTick : state.tick,
    waves: stats,
    investedByKind,
  };
}

/** 웨이브 n(1부터)이 시작되기 직전(카운트다운 1틱)까지 — 그 앞 웨이브는 봇이 평소대로. 조기 호출 봇은 카운트다운을 끝까지 보지 않아 쓰지 않는다 */
export function runToWaveStart(driver: GameDriver, bot: Bot, n: number): void {
  runGame(driver, bot, (d) => d.state.wavesStarted >= n - 1 && (n === 1 || d.state.countdown === 1 || d.state.wavesStarted >= n));
}
