/**
 * 탐색 봇 (defense DESIGN §S2) — 기준 봇 변형을 웨이브 묶음 단위로 빔 서치
 *   빔 B개 × 후보 K개: 같은 상태에서 교란한 기준 봇(구매 가치 교란·증강 선택 교란)으로 다음 horizon웨이브까지 돌려
 *   점수(버틴 웨이브 → 목숨 → 골드) 상위를 남긴다. 상위 플레이어 상한 추정용 — 최적해가 아니다(§S7)
 *   빔 한 자리는 교란 없는 기준 봇(증강 가치표) 계보로 고정한다 — 점수가 근시안이라 그 계보가 밀려나면 기준 봇보다 못한 판이 나온다
 *   (그래서 탐색 봇 벽 ≥ 같은 seed의 기준 봇(증강 가치표) 붕괴 웨이브)
 */

import { GameDriver } from '../driver';
import { botRandom, greedyBot } from './bots';
import { runGame } from './runner';

export type SearchOptions = { beam?: number; candidates?: number; horizon?: number; noise?: number };

/** 빔 서치 진행 상태 — beams[0]은 늘 무교란 계보. 라운드 사이에서 멈췄다 이어 갈 수 있다(무한 램프 맞춤이 웨이브 30까지의 앞부분을 다시 쓰게) */
export type SearchState = { beams: GameDriver[]; round: number };

const MAX_ROUNDS = 200;

function score(driver: GameDriver): number {
  const s = driver.state;
  return s.wavesCleared * 1e6 + s.lives * 1e3 + Math.min(999, Math.floor(s.gold / 10));
}

function settings(options: SearchOptions) {
  return { beam: options.beam ?? 8, candidates: options.candidates ?? 12, horizon: options.horizon ?? 3, noise: options.noise ?? 0.6 };
}

/** 교란 없는 기준 봇 — 무교란 계보(빔 0의 후보 0) (상태 없음 — 어느 틱에서 이어 돌려도 연속 판과 같다) */
const PURE_BOT = greedyBot({ augment: 'value' });

export function searchBegin(start: GameDriver): SearchState {
  return { beams: [start], round: 0 };
}

/** 이번 라운드가 플레이할 마지막 웨이브 — 살아 있는 빔 중 가장 먼 것(−1 = 모두 끝남) */
export function searchRoundReach(state: SearchState, options: SearchOptions = {}): number {
  const { horizon } = settings(options);
  let reach = -1;
  for (const d of state.beams) if (!d.state.over) reach = Math.max(reach, d.state.wavesStarted + horizon);
  return reach;
}

/**
 * 라운드를 이어 돈다 — 모두 끝나거나 라운드 상한, 또는 stopBefore(이번 라운드가 플레이할 마지막 웨이브)가 참이면 멈춘다
 * 후보 k의 난수는 (seed, 라운드, 빔, k)로 정한다 — 멈췄다 이어도 같은 판
 */
export function searchAdvance(state: SearchState, seed: number, options: SearchOptions = {}, stopBefore?: (reach: number) => boolean): SearchState {
  const { beam, candidates, horizon, noise } = settings(options);
  let { beams, round } = state;
  for (; round < MAX_ROUNDS; round++) {
    if (beams.every((d) => d.state.over)) break;
    if (stopBefore && stopBefore(searchRoundReach({ beams, round }, options))) break;
    let pure = beams[0];
    const pool: { driver: GameDriver; score: number }[] = [];
    beams.forEach((base, b) => {
      if (base.state.over) {
        if (b > 0) pool.push({ driver: base, score: score(base) });
        return;
      }
      const target = base.state.wavesStarted + horizon;
      for (let k = 0; k < candidates; k++) {
        const driver = base.clone();
        const bot = k === 0 ? PURE_BOT : greedyBot({ noise, random: botRandom(seed * 7919 + round * 131 + b * 17 + k), augment: k % 3 === 2 ? 'random' : 'value' });
        runGame(driver, bot, (d) => d.state.wavesStarted >= target && d.state.countdown === 1);
        if (b === 0 && k === 0) pure = driver;
        else pool.push({ driver, score: score(driver) });
      }
    });
    pool.sort((x, y) => y.score - x.score);
    beams = [pure, ...pool.slice(0, beam - 1).map((p) => p.driver)];
  }
  return { beams, round };
}

/** 빔 중 가장 좋은 판 (동점이면 앞 — 무교란 계보 우선) */
export function searchBest(state: SearchState): GameDriver {
  let best = state.beams[0];
  for (const d of state.beams) if (score(d) > score(best)) best = d;
  return best;
}

/** 판 끝까지 빔 서치 — 가장 좋은 판의 드라이버(명령 기록 포함)를 돌려준다 */
export function searchPlay(start: GameDriver, seed: number, options: SearchOptions = {}): GameDriver {
  return searchBest(searchAdvance(searchBegin(start), seed, options));
}
