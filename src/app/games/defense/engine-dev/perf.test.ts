import { describe, it, expect } from 'vitest';
import {
  ENEMY_STATUS,
  MAX_ALIVE_ENEMIES,
  MAX_PROJECTILES,
  MAX_TICKS,
  OP,
  STAGE_E1,
  type GameState,
  type ReplayInput,
  simulateReplay,
  step,
} from '../engine';
import { GameDriver } from './driver';
import { buildGoldenCases } from './goldenCases';

/**
 * 성능 실측 (defense DESIGN §E5) — 수동 DoD, CI에서 돌지 않는다
 * (a) 실제 판 simulateReplay ≤ 300ms(워밍업 1 + 측정 5회 중앙값) · (b) 적 200·투사체 400 상태의 step 1틱 단가 × MAX_TICKS ≤ 2,000ms (Node)
 * DEFENSE_PERF=1 pnpm exec vitest run src/app/games/defense/engine-dev/perf.test.ts
 * E1은 캠페인 시험 스테이지만 있어 (a)는 최장 골든 판으로 잰다 — 무한 모드 벽 근처 판은 E2·S1 이후 다시 잰다
 * 계약 기준은 plain Node(§E5). vitest 안에서는 같은 코드가 약 1.5~2.8배 느리게 나온다(2026-10-21 실측: vitest 상한 2.75초 · plain Node 1.47~1.52초)
 * plain Node 판정: 같은 시나리오를 담은 임시 진입 파일(레포 밖)을 레포의 esbuild로 번들해 node로 실행한다
 *   node_modules/.pnpm/esbuild@<버전>/node_modules/esbuild/bin/esbuild <진입>.ts --bundle --platform=node --format=cjs --outfile=<out>.cjs && node <out>.cjs
 */
const median = (runs: number[]) => [...runs].sort((x, y) => x - y)[Math.floor(runs.length / 2)];

function measure(fn: () => void, warmup = 1, runs = 5): number[] {
  for (let i = 0; i < warmup; i++) fn();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  return times;
}

/**
 * 궁수탑 Lv3 8개(E1 맵 슬롯 전부) + 적 200(경로 앞쪽에 퍼뜨림, 죽지 않는 HP) + 투사체 projectiles개(명중하지 않고 오래 난다)
 * E1 맵은 타워 8개(최대 약 0.44발/틱)라 "투사체 400 유지"와 "타워가 매 틱 표적 탐색"을 동시에 만들 수 없다 → 두 시나리오로 잰다
 */
function saturatedState(projectiles: number): GameState {
  const driver = new GameDriver(STAGE_E1, 1);
  driver.state.gold = 100000;
  for (let slot = 0; slot < 8; slot++) {
    driver.must(OP.BUILD, slot, 0);
    driver.must(OP.UPGRADE, slot);
    driver.must(OP.UPGRADE, slot);
  }
  const s = driver.state;
  s.lives = 1000000;
  const path = STAGE_E1.map.groundPaths[0];
  for (let i = 0; i < MAX_ALIVE_ENEMIES; i++) {
    s.enemies.push({
      id: s.nextId++, kind: 0, hp: 1e9, maxHp: 1e9, path: 0, dist: i * 100, segment: 0, segmentStart: 0,
      x: path.points[0], y: path.points[1], wave: 1, reward: 1, status: ENEMY_STATUS.ALIVE,
    });
  }
  s.aliveEnemies = MAX_ALIVE_ENEMIES;
  s.waves[0].total += MAX_ALIVE_ENEMIES;
  s.waves[0].pending += MAX_ALIVE_ENEMIES;
  for (let i = 0; i < projectiles; i++) {
    const target = s.enemies[i % MAX_ALIVE_ENEMIES];
    s.projectiles.push({
      id: s.nextId++, towerId: s.towers[i % 8].id, targetId: target.id, damage: 1, damageType: 0, element: 0,
      originX: 0, originY: 0, aimX: 0, aimY: 0, ticksLeft: 100000, totalTicks: 100000, status: 0, targetHint: 0,
    });
  }
  step(s); // 위치 계산
  return s;
}

/** 300틱 동안 적이 끝에 닿지 않는다(최대 거리 19,900 + 300 × 33 < 30,000) — 복제는 시간 밖, 앞 3회 워밍업 */
function perTickMs(base: GameState): number {
  const TICKS = 300;
  const runs: number[] = [];
  for (let r = 0; r < 8; r++) {
    const s = structuredClone(base);
    const t0 = performance.now();
    for (let i = 0; i < TICKS; i++) step(s);
    if (r >= 3) runs.push(performance.now() - t0);
    expect(s.enemies.length).toBe(MAX_ALIVE_ENEMIES);
  }
  return median(runs) / TICKS;
}

describe.runIf(process.env.DEFENSE_PERF === '1')('디펜스 엔진 성능', () => {
  it('(a) 실제 판 simulateReplay', () => {
    // 명령이 있는 실제 판 중 최장 (빈 판 idle-until-max-ticks는 적이 없어 대표성이 없다)
    const games = buildGoldenCases().filter((c) => c.expected.ok && c.input.inputs.length > 0);
    const longest = games.reduce((a, b) => (b.input.ticks > a.input.ticks ? b : a));
    const input: ReplayInput = longest.input;
    const times = measure(() => simulateReplay(input));
    console.log('[defense perf a]', { case: longest.name, ticks: input.ticks, commands: input.inputs.length, msMedian: median(times).toFixed(2), runs: times.map((t) => t.toFixed(2)) });
    expect(median(times)).toBeLessThan(300);
  });

  it('(b) 적 200 상태의 step 1틱 단가 × MAX_TICKS — 포화(투사체 400·타워 막힘)·활동(타워가 계속 탐색·발사), 상한 = 합 − 적 이동', () => {
    const saturated = perTickMs(saturatedState(MAX_PROJECTILES));
    const active = perTickMs(saturatedState(0));
    const enemiesOnly = (() => {
      const s = saturatedState(0);
      s.towers.length = 0;
      return perTickMs(s);
    })();
    // 보수적 상한: 두 시나리오 합 − 공통(적 이동) 한 번
    const bound = saturated + active - enemiesOnly;
    const ms = (perTick: number) => (perTick * MAX_TICKS).toFixed(0);
    console.log('[defense perf b]', {
      saturatedUsPerTick: (saturated * 1000).toFixed(1),
      activeUsPerTick: (active * 1000).toFixed(1),
      enemiesOnlyUsPerTick: (enemiesOnly * 1000).toFixed(1),
      saturatedMs: ms(saturated),
      activeMs: ms(active),
      boundMs: ms(bound),
    });
    // 판정은 plain Node로 한다(이 파일 머리 주석) — vitest 안 수치는 기록만. 다만 계약의 2배를 넘으면 회귀로 본다
    expect(bound * MAX_TICKS).toBeLessThan(4000);
  }, 120_000);
});
