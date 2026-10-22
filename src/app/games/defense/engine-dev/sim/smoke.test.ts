import { describe, it, expect } from 'vitest';
import { CAMPAIGN_STAGES, getStateHash, simulateReplay } from '../../engine';
import { GameDriver } from '../driver';
import { greedyBot, scriptedBot } from './bots';
import { runGame } from './runner';
import { CAMPAIGN_SCRIPTS } from './scripts';

/**
 * 시뮬레이터 CI 스모크 (defense DESIGN §S6) — 데이터 PR이 밸런스를 깨면 실패
 * 기준값은 웨이브 데이터를 다시 만들 때(DEFENSE_SIM_WRITE=1) 함께 갱신한다
 */
/** 무한 기준 봇(증강 가치표) seed 1~10 붕괴 웨이브 — 생성 시점 기록 */
const ENDLESS_BASELINE = [43, 38, 42, 30, 43, 44, 38, 33, 43, 38];

describe('디펜스 시뮬레이터 스모크', () => {
  it('결정성 — 같은 판 두 번이면 해시가 같고, 봇 판은 그대로 리플레이로 재현된다', () => {
    const play = () => {
      const driver = new GameDriver(CAMPAIGN_STAGES[2], 1);
      runGame(driver, greedyBot());
      return driver;
    };
    const a = play();
    expect(getStateHash(play().state)).toBe(getStateHash(a.state));
    expect(simulateReplay(a.toReplayInput())).toMatchObject({ ok: true, stateHash: getStateHash(a.state) });
  });

  for (const [i, stage] of CAMPAIGN_STAGES.entries()) {
    it(`${stage.id.toUpperCase()} 보통 — 기준 봇·각본 봇 클리어`, () => {
      expect(runGame(new GameDriver(stage, 1), greedyBot()).victory).toBe(true);
      expect(runGame(new GameDriver(stage, 1), scriptedBot(CAMPAIGN_SCRIPTS[i])).victory).toBe(true);
    });
  }

  it('무한 기준 봇 seed 1~10 붕괴 웨이브가 기록값 ±3', () => {
    const waves = ENDLESS_BASELINE.map((_, i) => runGame(GameDriver.fromBoard('endless', 'endless-s1', i + 1), greedyBot()).wavesCleared);
    waves.forEach((w, i) => expect(Math.abs(w - ENDLESS_BASELINE[i])).toBeLessThanOrEqual(3));
  }, 60_000);
});
