import { describe, it, expect } from 'vitest';
import { MAX_ENEMY_HP, MAX_WAVE, PERMILLE } from './constants';
import { ENEMIES, ENEMY_ID } from './data/enemies';
import { MAP_ENDLESS } from './data/maps';
import { type Wave } from './data/stages';
import { ENDLESS_DESIGNED_PRESSURE, ENDLESS_RAMP_PERMILLE } from './data/waves';
import { streamSeed } from './random';
import { killReward } from './spawn';
import { ROLE, type ComposeOptions, type WavePool, composeWave, endlessPool, endlessPressure, roleOfWave } from './wavegen';

const E = ENEMY_ID;
const options: ComposeOptions = { groundPaths: 2, hasAirPath: true, airDouble: false, bossEscort: false };
const rngOf = (seed: number) => ({ state: streamSeed(seed, 1) });

/** 웨이브 HP 총량 중 공중 비율 ‰ */
function airShare(wave: Wave): number {
  let all = 0;
  let air = 0;
  for (const g of wave.groups) {
    const kind = ENEMIES[g.enemyId];
    const hp = g.hp * g.count * kind.swarm;
    all += hp;
    if (kind.air) air += hp;
  }
  return all === 0 ? 0 : Math.round((air * PERMILLE) / all);
}

describe('웨이브 구성기 (§L3)', () => {
  it('공중 비율 상한 — 공중이 섞인 웨이브(보스 제외)는 공중 HP 비중이 대략 40% 이하 (모든 역할·seed)', () => {
    let mixed = 0;
    for (let seed = 1; seed <= 200; seed++) {
      for (let n = 11; n <= 40; n++) {
        const role = roleOfWave(n, MAX_WAVE, false);
        if (role === ROLE.BOSS) continue;
        const wave = composeWave(n, role, 300, endlessPool(n), options, rngOf(seed * 100 + n));
        if (wave.groups.some((g) => ENEMIES[g.enemyId].air)) {
          mixed++;
          // 마리 수 내림(위협 가중치·묶음)만큼 400‰를 조금 넘을 수 있다
          expect(airShare(wave)).toBeLessThanOrEqual(480);
        }
      }
    }
    expect(mixed).toBeGreaterThan(50);
  });

  it('사제(치유형)는 웨이브당 3마리까지 — 줄인 만큼 HP를 올려 예산을 지킨다', () => {
    const pool: WavePool = { main: [E.PRIEST], tank: [], rush: [], rest: [], escort: [], boss: [] };
    const wave = composeWave(20, ROLE.BASIC, 500, pool, options, rngOf(1));
    const priest = wave.groups.find((g) => g.enemyId === E.PRIEST)!;
    // 칸 45(36초×30/24) → 위협 2000이라 22마리 몫 · 단위 EHP 400(압력 500×24/30) × hp‰ 900 × 22 / 3마리
    expect([priest.count, priest.hp]).toEqual([3, Math.floor((400 * 900 * 22) / (1000 * 3))]);
  });

  it('첫 등장 단독 웨이브 — 후보가 하나면 그 적만', () => {
    const solo: WavePool = { main: [E.SPLITTER], tank: [E.SPLITTER], rush: [E.SPLITTER], rest: [E.SPLITTER], escort: [E.SPLITTER], boss: [] };
    for (const role of [ROLE.BASIC, ROLE.PLUS, ROLE.RUSH]) {
      const wave = composeWave(5, role, 100, solo, options, rngOf(role));
      expect(wave.groups.every((g) => g.enemyId === E.SPLITTER)).toBe(true);
    }
  });

  it('R3 공중 2배 — 공중 후보 뽑기 가중치 2 (공중 웨이브가 늘어난다) · R4 — 보스 웨이브에 공성 거인 동반', () => {
    const count = (airDouble: boolean) => {
      let air = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const wave = composeWave(21, ROLE.RUSH, 300, endlessPool(21), { ...options, airDouble }, rngOf(seed));
        if (wave.groups.some((g) => ENEMIES[g.enemyId].air)) air++;
      }
      return air;
    };
    expect(count(true)).toBeGreaterThan(count(false));
    const escorted = composeWave(25, ROLE.BOSS, 300, endlessPool(25), { ...options, bossEscort: true }, rngOf(1));
    expect(escorted.groups.some((g) => g.enemyId === E.GIANT)).toBe(true);
  });

  it('새 보스 종류가 열리는 웨이브(용 25)는 모든 seed가 그 보스 — 뒤 보스 웨이브는 소환사·용이 섞인다', () => {
    const bossOf = (n: number, seed: number) => {
      const wave = composeWave(n, ROLE.BOSS, 300, endlessPool(n), options, rngOf(seed));
      return wave.groups.find((g) => g.delayTicks > 0 && g.count === 1)!.enemyId;
    };
    const later = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      expect(bossOf(25, seed)).toBe(E.DRAGON);
      later.add(bossOf(30, seed));
    }
    expect([...later].sort((a, b) => a - b)).toEqual([E.SUMMONER, E.DRAGON]);
    // 첫 대면 규칙은 보스가 열리는 웨이브가 보스 웨이브일 때만 걸린다
    expect(roleOfWave(25, MAX_WAVE, false)).toBe(ROLE.BOSS);
  });

  it('공중 경로가 없는 맵 — 공중 적도 지상 경로 인덱스(갈래 수 안)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const wave = composeWave(30, ROLE.RUSH, 300, endlessPool(30), { ...options, groundPaths: 1, hasAirPath: false }, rngOf(seed));
      for (const g of wave.groups) expect(g.path).toBe(0);
    }
  });
});

describe('킬 보상 감쇠 — 램프 구간 300‰ (§L6)', () => {
  it('rampFrom 30: 31웨이브부터 300‰ · rampFrom 0이면 기존 K(n)', () => {
    const grunt = ENEMIES[E.GRUNT];
    expect(killReward(grunt, 10000, 31, 45, 30)).toBe(Math.floor((10000 * 45 * 300) / 1000000));
    expect(killReward(grunt, 10000, 30, 45, 30)).toBe(Math.floor((10000 * 45 * 650) / 1000000));
    expect(killReward(grunt, 10000, 31, 45, 0)).toBe(Math.floor((10000 * 45 * 650) / 1000000));
  });
});

describe('정수 안전 — 구성기·램프 최악값 < 2⁵³ (§E1)', () => {
  it('그룹 HP 중간값 단위 EHP × hp‰ × 스폰 수 · 80웨이브 램프 acc × 압력', () => {
    const maxSpawns = Math.floor((36 * 30) / 10); // 러시 최대 칸
    const maxPermille = Math.max(...ENEMIES.map((e) => e.hpPermille));
    expect(MAX_ENEMY_HP * maxPermille * maxSpawns).toBeLessThan(Number.MAX_SAFE_INTEGER);
    const p80 = endlessPressure(ENDLESS_DESIGNED_PRESSURE, MAX_WAVE, ENDLESS_RAMP_PERMILLE);
    expect(p80).toBeLessThanOrEqual(MAX_ENEMY_HP);
    expect(Math.max(...ENDLESS_DESIGNED_PRESSURE) * 100 * ENDLESS_RAMP_PERMILLE).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(MAP_ENDLESS.slots.length).toBe(16);
  });
});
