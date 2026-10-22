import { describe, it, expect } from 'vitest';
import {
  ABILITY,
  ATTACK,
  EFFECT_OP,
  KILL_REWARD_G_CAMPAIGN,
  MAX_ENEMY_HP,
  MAX_WAVE,
  OP,
  PERMILLE,
  RANK,
  RARITY,
  RESIST_CAP_PERMILLE,
  SCOPE,
  STATUS,
  TICKS_PER_SECOND,
  TILE,
} from './constants';
import { AUGMENTS } from './data/augments';
import { ENEMIES, ENEMY_ID } from './data/enemies';
import { MAP_E1, MAP_E2, MAP_ENDLESS, type MapPath } from './data/maps';
import { RULE_COUNT, RULE_ID, WEIGHT_UNIT, conflicts, isWeeklyBoardKey, legalBans, pickWeekly, ruleEffects } from './data/rules';
import { WEEKLY_COMBOS } from './data/weeklyCombos';
import { CAMPAIGN_STAGES, STAGES, WEEKLY_MAPS, findStage, resolveBoard } from './data/stages';
import { applyCommand, createGame, step } from './game';
import { createEnemy } from './spawn';
import { testProjectile } from '../engine-dev/fixtures';
import { ENDLESS_DESIGNED_PRESSURE, ENDLESS_RAMP_PERMILLE } from './data/waves';
import { DESIGNED_WAVES, endlessPressure } from './wavegen';
import { TOWERS, TOWER_ID, type TowerStage, towerStage } from './data/towers';

/** 테스트 파일은 결정성 규칙 밖 — 부동소수로 데이터를 검산한다 */
function segmentDistance(px: number, py: number, path: MapPath): number {
  let best = Infinity;
  const p = path.points;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const [x0, y0, x1, y1] = [p[i], p[i + 1], p[i + 2], p[i + 3]];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy)));
  }
  return best;
}

/** 모든 단계 (Lv1~3 + 분기 2 × Lv4·5) */
function allStages(): { kind: number; level: number; branch: number; stage: TowerStage }[] {
  const out: { kind: number; level: number; branch: number; stage: TowerStage }[] = [];
  for (const t of TOWERS) {
    for (let level = 1; level <= 3; level++) out.push({ kind: t.id, level, branch: 0, stage: towerStage(t, level, 0) });
    for (let branch = 1; branch <= 2; branch++) {
      for (let level = 4; level <= 5; level++) out.push({ kind: t.id, level, branch, stage: towerStage(t, level, branch) });
    }
  }
  return out;
}

describe('맵 데이터 (D-021 세로 9×15 · §E1 정수 경로)', () => {
  for (const map of [MAP_E1, MAP_E2, ...CAMPAIGN_STAGES.map((s) => s.map), MAP_ENDLESS]) {
    it(`${map.id}: 9×15칸, 1칸 = 1000 밀리타일`, () => {
      expect(map.width).toBe(9 * TILE);
      expect(map.height).toBe(15 * TILE);
    });

    for (const path of [...map.groundPaths, ...map.airPaths]) {
      it(`${map.id} 경로: 정수 좌표·맵 안·구간 길이 = 좌표 거리(반올림)·합계 = total`, () => {
        const p = path.points;
        expect(p.length % 2).toBe(0);
        expect(path.segmentLengths).toHaveLength(p.length / 2 - 1);
        let total = 0;
        for (let i = 0; i < path.segmentLengths.length; i++) {
          const [x0, y0, x1, y1] = p.slice(i * 2, i * 2 + 4);
          for (const v of [x0, y0, x1, y1]) expect(Number.isInteger(v)).toBe(true);
          expect(x0 >= 0 && x0 <= map.width && y0 >= 0 && y0 <= map.height).toBe(true);
          expect(path.segmentLengths[i]).toBe(Math.round(Math.hypot(x1 - x0, y1 - y0)));
          expect(path.segmentLengths[i]).toBeGreaterThan(0);
          total += path.segmentLengths[i];
        }
        expect(path.total).toBe(total);
      });
    }

    it(`${map.id} 빌드 슬롯: 맵 안·서로 중심 간격 ≥ 1.1칸·지상 경로 중심선에서 ≥ 1칸`, () => {
      const slots = map.slots;
      for (let i = 0; i < slots.length; i++) {
        const a = slots[i];
        expect(a.x > 0 && a.x < map.width && a.y > 0 && a.y < map.height).toBe(true);
        for (const path of map.groundPaths) expect(segmentDistance(a.x, a.y, path)).toBeGreaterThanOrEqual(TILE);
        for (let j = i + 1; j < slots.length; j++) {
          expect(Math.hypot(a.x - slots[j].x, a.y - slots[j].y)).toBeGreaterThanOrEqual(1.1 * TILE);
        }
      }
    });
  }

  it('캠페인 슬롯 8·9·10·10·11·12·12·13 (§L2) · 공중 경로는 S4부터 · 무한 슬롯 14 + 잠긴 2 · 경로는 출구(아래 끝)에서 끝난다', () => {
    expect(CAMPAIGN_STAGES.map((s) => s.map.slots.length)).toEqual([8, 9, 10, 10, 11, 12, 12, 13]);
    expect(CAMPAIGN_STAGES.map((s) => s.map.airPaths.length > 0)).toEqual([false, false, false, true, true, true, true, true]);
    expect(MAP_ENDLESS.slots.filter((x) => !x.locked)).toHaveLength(14);
    expect(MAP_ENDLESS.slots.filter((x) => x.locked)).toHaveLength(2);
    for (const map of [...CAMPAIGN_STAGES.map((s) => s.map), MAP_ENDLESS]) {
      for (const p of [...map.groundPaths, ...map.airPaths]) {
        expect(p.points[1]).toBe(0);
        expect(p.points[p.points.length - 1]).toBe(map.height);
      }
    }
  });

  it('E1: 슬롯 8 · 공중 경로 없음 / E2: 지상 2갈래 · 공중 1 · 슬롯 14(잠긴 2개는 맨 뒤)', () => {
    expect(MAP_E1.slots).toHaveLength(8);
    expect(MAP_E1.airPaths).toEqual([]);
    expect(MAP_E2.groundPaths).toHaveLength(2);
    expect(MAP_E2.airPaths).toHaveLength(1);
    expect(MAP_E2.slots).toHaveLength(14);
    expect(MAP_E2.slots.map((s) => s.locked === true)).toEqual([...Array(12).fill(false), true, true]);
  });
});

describe('타워 데이터 (§C4)', () => {
  it('궁수탑 Lv1~3: 8/18 · 13/18 · 19/18, 사거리 3.0 · 3.0 · 3.3칸, 비용 70 · +50 · +80, 지공', () => {
    expect(TOWERS[0].levels.map((l) => [l.cost, l.damage, l.periodTicks, l.range])).toEqual([
      [70, 8, 18, 3000],
      [50, 13, 18, 3000],
      [80, 19, 18, 3300],
    ]);
    expect(TOWERS[0].levels.every((l) => l.hitsGround && l.hitsAir)).toBe(true);
  });

  it('6종 × 단계 9개, 비용은 단계마다 70 · 50 · 80 · 140 · 240 (누적 70·120·200·340·580)', () => {
    expect(TOWERS).toHaveLength(6);
    for (const { level, stage } of allStages()) expect(stage.cost).toBe([70, 50, 80, 140, 240][level - 1]);
  });

  it('공격 대상: 대포 지상만 · 대공 석궁 공중만 · 나머지 양용', () => {
    for (const { kind, stage } of allStages()) {
      expect(stage.hitsGround).toBe(kind !== TOWER_ID.CROSSBOW);
      expect(stage.hitsAir).toBe(kind !== TOWER_ID.CANNON);
    }
  });

  it('공격 형태: 서리 = 펄스 · 테슬라 = 연쇄 · 마법 = 즉발(4A·5A 광선) · 나머지 투사체', () => {
    for (const { kind, level, branch, stage } of allStages()) {
      const expected =
        kind === TOWER_ID.FROST ? ATTACK.PULSE
        : kind === TOWER_ID.TESLA ? ATTACK.CHAIN
        : kind === TOWER_ID.MAGE ? (level >= 4 && branch === 1 ? ATTACK.BEAM : ATTACK.INSTANT)
        : ATTACK.PROJECTILE;
      expect(stage.attack).toBe(expected);
    }
  });

  it('Lv5 궁극: 서리 5A 눈보라(300틱) · 테슬라 5A 폭풍 코일(240틱 10연쇄) · 5B 전자기 펄스(360틱)', () => {
    const ult = (kind: number, branch: number) => towerStage(TOWERS[kind], 5, branch).specials.map((s) => [s.kind, s.every ?? 0]);
    expect(ult(TOWER_ID.FROST, 1)).toContainEqual([9, 300]);
    expect(ult(TOWER_ID.TESLA, 1)).toContainEqual([10, 240]);
    expect(ult(TOWER_ID.TESLA, 2)).toContainEqual([9, 360]);
  });

  it('인덱스 = id', () => {
    TOWERS.forEach((t, i) => expect(t.id).toBe(i));
    ENEMIES.forEach((e, i) => expect(e.id).toBe(i));
    AUGMENTS.forEach((c, i) => expect(c.id).toBe(i));
  });
});

/**
 * 기준 곡선 대응 (§L4 ±15%) — bun docs/tasks/defense/tools/tower_curve_check.py 의 표와 같은 행
 * (피해·주기·지속 DPS는 엔진 데이터에서 읽고, 평균 배율·역할 계수만 도구 표에서 옮긴다)
 */
describe('타워 곡선 대응 (tower_curve_check.py)', () => {
  const REF = [0, 14, 22, 34, 53, 84];
  // [kind, level, branch, 도구 표 피해, 도구 표 주기, 도구 표 지속 DPS, 평균 배율, 역할 계수]
  const ROWS: [number, number, number, number, number, number, number, number][] = [
    [0, 1, 0, 8, 18, 0, 1.0, 1.05], [0, 2, 0, 13, 18, 0, 1.0, 1.05], [0, 3, 0, 19, 18, 0, 1.0, 1.05],
    [0, 4, 1, 50, 30, 0, 1.0, 1.05], [0, 4, 2, 16, 12, 12, 1.0, 1.05], [0, 5, 1, 55, 30, 0, 1.6, 1.05], [0, 5, 2, 20, 12, 20, 1.0, 1.05],
    [1, 1, 0, 14, 45, 0, 1.0, 1.6], [1, 2, 0, 22, 45, 0, 1.0, 1.6], [1, 3, 0, 34, 45, 0, 1.0, 1.6],
    [1, 4, 1, 40, 45, 6, 1.0, 1.6], [1, 4, 2, 110, 75, 0, 1.0, 1.2], [1, 5, 1, 60, 45, 10, 1.0, 1.6], [1, 5, 2, 170, 75, 0, 1.0, 1.2],
    [2, 1, 0, 15, 33, 0, 1.0, 1.0], [2, 2, 0, 24, 33, 0, 1.0, 1.0], [2, 3, 0, 37, 33, 0, 1.0, 1.0],
    [2, 4, 1, 41, 30, 0, 1.3, 1.0], [2, 4, 2, 45, 30, 0, 1.0, 1.15], [2, 5, 1, 55, 30, 0, 1.5, 1.0], [2, 5, 2, 65, 30, 0, 1.1, 1.15],
    [3, 1, 0, 5, 30, 0, 1.0, 2.8], [3, 2, 0, 8, 30, 0, 1.0, 2.8], [3, 3, 0, 12, 30, 0, 1.0, 2.8],
    [3, 4, 1, 18, 30, 0, 1.0, 2.9], [3, 4, 2, 18, 30, 0, 1.0, 2.9], [3, 5, 1, 28, 30, 0, 1.0, 3.0], [3, 5, 2, 28, 30, 0, 1.0, 3.0],
    [4, 1, 0, 32, 45, 0, 1.0, 0.65], [4, 2, 0, 50, 45, 0, 1.0, 0.65], [4, 3, 0, 78, 45, 0, 1.0, 0.65],
    [4, 4, 1, 70, 45, 0, 1.0, 1.04], [4, 4, 2, 120, 45, 0, 1.0, 0.65], [4, 5, 1, 115, 45, 0, 1.0, 1.04], [4, 5, 2, 190, 45, 0, 1.0, 0.65],
    [5, 1, 0, 9, 30, 0, 1.0, 1.6], [5, 2, 0, 14, 30, 0, 1.0, 1.6], [5, 3, 0, 21, 30, 0, 1.0, 1.6],
    [5, 4, 1, 25, 30, 0, 1.0, 2.1], [5, 4, 2, 33, 30, 0, 1.0, 1.6], [5, 5, 1, 38, 30, 0, 1.0, 2.1], [5, 5, 2, 50, 30, 0, 1.0, 1.6],
  ];

  /** 단일 대상 최대 지속 DPS — 화상 1스택 초당 피해 · 중독 최대 스택 × 스택당 초당 피해 */
  function dotDps(stage: TowerStage): number {
    let dps = 0;
    for (const s of stage.status) {
      if (s.status === STATUS.BURN) dps += s.value;
      if (s.status === STATUS.POISON) dps += s.value * (s.cap ?? 1);
    }
    return dps;
  }

  it('도구 표 42행 = 엔진 단계 42개', () => {
    expect(ROWS).toHaveLength(allStages().length);
  });

  for (const [kind, level, branch, damage, period, dot, avg, coef] of ROWS) {
    it(`타워 ${kind} Lv${level}${branch ? '/' + branch : ''}: 데이터 = 도구 표, 환산 DPS가 기준 ±15%`, () => {
      const stage = towerStage(TOWERS[kind], level, branch);
      expect([stage.damage, stage.periodTicks, dotDps(stage)]).toEqual([damage, period, dot]);
      const converted = ((damage * TICKS_PER_SECOND) / period * avg + dot) * coef;
      const ratio = converted / REF[level];
      expect(ratio).toBeGreaterThanOrEqual(0.85);
      expect(ratio).toBeLessThanOrEqual(1.15);
    });
  }
});

describe('적 데이터 (§C5)', () => {
  it('11종 + 분열 새끼 — 이동·속도·저항·누수', () => {
    const row = (id: number) => {
      const e = ENEMIES[id];
      return [e.air, e.speed, e.resistPhy, e.resistMag, e.leakLives, e.rank];
    };
    const { NORMAL, ELITE, BOSS } = RANK;
    expect(row(ENEMY_ID.GRUNT)).toEqual([false, 33, 0, 0, 1, NORMAL]);
    expect(row(ENEMY_ID.RUNNER)).toEqual([false, 53, 0, 0, 1, NORMAL]);
    expect(row(ENEMY_ID.SHIELD)).toEqual([false, 27, 500, 0, 1, NORMAL]);
    expect(row(ENEMY_ID.SPLITTER)).toEqual([false, 33, 0, 0, 1, NORMAL]);
    expect(row(ENEMY_ID.BATS)).toEqual([true, 47, 0, 0, 1, NORMAL]);
    expect(row(ENEMY_ID.SUMMONER)).toEqual([false, 17, 0, 400, 10, BOSS]);
    expect(row(ENEMY_ID.GHOST)).toEqual([false, 37, 700, 0, 1, NORMAL]);
    expect(row(ENEMY_ID.WYVERN)).toEqual([true, 60, 200, 0, 2, NORMAL]);
    expect(row(ENEMY_ID.PRIEST)).toEqual([false, 30, 0, 500, 1, NORMAL]);
    expect(row(ENEMY_ID.GIANT)).toEqual([false, 20, 400, 200, 3, ELITE]);
    expect(row(ENEMY_ID.DRAGON)).toEqual([true, 17, 600, 0, 20, BOSS]);
    expect(row(ENEMY_ID.SPLITLING)).toEqual([false, 43, 0, 0, 1, NORMAL]);
  });

  it('능력: 분열 3(250‰) · 소환 180틱 졸개 3 · 치유 30틱 1.5칸 3% · 용 페이즈 박쥐 떼 2 · 박쥐 떼 5마리', () => {
    expect(ENEMIES[ENEMY_ID.SPLITTER].ability).toMatchObject({ kind: ABILITY.SPLIT, count: 3, value: 250, spawnKind: ENEMY_ID.SPLITLING });
    expect(ENEMIES[ENEMY_ID.SUMMONER].ability).toMatchObject({ kind: ABILITY.SUMMON, every: 180, count: 3, spawnKind: ENEMY_ID.GRUNT });
    expect(ENEMIES[ENEMY_ID.PRIEST].ability).toMatchObject({ kind: ABILITY.HEAL, every: 30, value: 30, radius: 1500 });
    expect(ENEMIES[ENEMY_ID.DRAGON].ability).toMatchObject({ kind: ABILITY.PHASE_SWAP, count: 2, spawnKind: ENEMY_ID.BATS });
    expect(ENEMIES[ENEMY_ID.BATS].swarm).toBe(5);
  });

  it('보스 공통 감속·기절·취약 50% · 공성 거인 감속·기절 50%', () => {
    for (const id of [ENEMY_ID.SUMMONER, ENEMY_ID.DRAGON]) {
      expect(ENEMIES[id]).toMatchObject({ slowScale: 500, stunScale: 500, vulnerableScale: 500 });
    }
    expect(ENEMIES[ENEMY_ID.GIANT]).toMatchObject({ slowScale: 500, stunScale: 500, vulnerableScale: 1000 });
  });
});

describe('증강 카드 24장 (§C7)', () => {
  it('희귀도 분포 일반 11 · 희귀 11 · 전설 2, 효과는 정수 데이터', () => {
    expect(AUGMENTS).toHaveLength(24);
    const count = (r: number) => AUGMENTS.filter((c) => c.rarity === r).length;
    expect([count(RARITY.COMMON), count(RARITY.RARE), count(RARITY.LEGENDARY)]).toEqual([11, 11, 2]);
    for (const card of AUGMENTS) {
      expect(card.effects.length).toBeGreaterThan(0);
      for (const e of card.effects) {
        for (const v of [e.scope, e.target, e.stat, e.op, e.value]) expect(Number.isInteger(v) && v >= 0).toBe(true);
        expect(e.op <= EFFECT_OP.FLAG && e.scope <= SCOPE.RULES).toBe(true);
      }
      for (const t of card.towers) expect(TOWERS[t]).toBeDefined();
    }
  });
});

describe('주간 규칙 변형 15개 (§C8)', () => {
  it('규칙마다 효과가 있다', () => {
    for (let id = 1; id <= RULE_COUNT; id++) expect(ruleEffects(id, 0).length).toBeGreaterThan(0);
    expect(ruleEffects(0, 0)).toEqual([]);
  });

  it('허용 목록 = (맵, 조합) 쌍: 맵 인덱스는 풀 안 · 규칙 2~3개 · 오름차순 중복 없음 · 상충 없음 · 금지 타워는 R6일 때만', () => {
    expect(WEEKLY_COMBOS.length).toBeGreaterThan(50);
    for (const entry of WEEKLY_COMBOS) {
      expect(entry[0] >= 0 && entry[0] < WEEKLY_MAPS.length).toBe(true);
      const banned = entry[1] - 1;
      const rules = entry.slice(2);
      expect(rules.length >= 2 && rules.length <= 3).toBe(true);
      for (let i = 0; i < rules.length; i++) {
        expect(rules[i] >= 1 && rules[i] <= RULE_COUNT).toBe(true);
        if (i > 0) expect(rules[i]).toBeGreaterThan(rules[i - 1]);
        for (let j = i + 1; j < rules.length; j++) expect(conflicts(rules[i], rules[j], banned)).toBe(false);
      }
      expect(banned >= 0).toBe(rules.includes(RULE_ID.BAN));
      if (banned >= 0) expect(TOWERS[banned]).toBeDefined();
    }
  });

  it('주간 뽑기 전제 — 규칙 id가 16진 한 자리(RULE_COUNT < 16) · R6 조합의 합법 금지 타워 수가 WEIGHT_UNIT을 나눠떨어뜨린다', () => {
    expect(RULE_COUNT).toBeLessThan(16);
    for (const entry of WEEKLY_COMBOS) if (entry[1] > 0) expect(WEIGHT_UNIT % legalBans(entry)).toBe(0);
  });

  it('주간 허용 목록: 풀의 맵 9개마다 허용 항목이 하나 이상 (어떤 주간 seed도 빈 목록에 닿지 않는다)', () => {
    for (let m = 0; m < WEEKLY_MAPS.length; m++) expect(WEEKLY_COMBOS.some((e) => e[0] === m)).toBe(true);
  });

  // pickWeekly는 허용 목록(수천 쌍)을 여러 번 훑는다 — 수천 seed 표본은 전체 실행(병렬 부하)에서 기본 5초를 넘길 수 있다
  const PICK_WEEKLY_TIMEOUT = 30_000;

  it('주간 맵은 풀 9개에 고르게 (허용 쌍 수와 무관 — 맵마다 4500 seed 중 대략 1/9)', () => {
    const counts = WEEKLY_MAPS.map(() => 0);
    for (let seed = 0; seed < 4500; seed++) counts[pickWeekly((seed * 2654435761) % 4294967296).mapIndex]++;
    for (const c of counts) expect(c > 380 && c < 620).toBe(true);
  }, PICK_WEEKLY_TIMEOUT);

  it('주간 규칙 분포 — 규칙 2·3개가 대략 반반 · R6(금지) 조합이 금지 타워 변형 수만큼 부풀지 않는다', () => {
    let three = 0;
    let ban = 0;
    const N = 6000;
    for (let seed = 0; seed < N; seed++) {
      const r = pickWeekly((seed * 2654435761) % 4294967296);
      if (r.rules.length === 3) three++;
      if (r.rules.includes(RULE_ID.BAN)) ban++;
    }
    expect(three / N).toBeGreaterThan(0.4);
    expect(three / N).toBeLessThan(0.6);
    expect(ban / N).toBeLessThan(0.3);
  }, PICK_WEEKLY_TIMEOUT);

  it('pickWeekly: 같은 seed = 같은 결과 · 허용 목록 안 (맵, 조합) 쌍', () => {
    const listed = new Set(WEEKLY_COMBOS.map((c) => c.join(',')));
    for (let seed = 0; seed < 500; seed++) {
      const s = (seed * 2654435761) % 4294967296;
      const r = pickWeekly(s);
      expect(pickWeekly(s)).toEqual(r);
      expect(listed.has([r.mapIndex, r.bannedTower + 1, ...r.rules].join(','))).toBe(true);
    }
  }, PICK_WEEKLY_TIMEOUT);

  it('isWeeklyBoardKey: weekly-YYYY-wNN (01~53)', () => {
    for (const key of ['weekly-2026-w01', 'weekly-2026-w43', 'weekly-2027-w53']) expect(isWeeklyBoardKey(key)).toBe(true);
    for (const key of ['weekly-2026-w00', 'weekly-2026-w54', 'weekly-2026-43', 'weekly-26-w43', 'weekly-2026-wab', 'endless-s1', '']) {
      expect(isWeeklyBoardKey(key)).toBe(false);
    }
  });
});

describe('스테이지·보드', () => {
  for (const stage of STAGES) {
    it(`스테이지 ${stage.id}: 웨이브 수·그룹 참조·HP 상한·경로`, () => {
      expect(stage.waves.length).toBeGreaterThan(0);
      expect(stage.waves.length).toBeLessThanOrEqual(MAX_WAVE);
      for (const t of stage.towers) expect(TOWERS[t]).toBeDefined();
      for (const wave of stage.waves) {
        expect(wave.groups.length).toBeGreaterThan(0);
        for (const g of wave.groups) {
          const kind = ENEMIES[g.enemyId];
          expect(kind).toBeDefined();
          const paths = kind.air && stage.map.airPaths.length > 0 ? stage.map.airPaths : stage.map.groundPaths;
          expect(paths[g.path]).toBeDefined();
          expect(Number.isInteger(g.hp) && g.hp > 0 && g.hp <= MAX_ENEMY_HP).toBe(true);
          expect(g.count > 0 && g.intervalTicks > 0 && g.delayTicks >= 0).toBe(true);
        }
      }
    });
  }

  it('E2 아레나는 적 11종을 모두 쓴다(새끼는 분열로)', () => {
    const used = new Set(STAGES.find((s) => s.id === 'e2')!.waves.flatMap((w) => w.groups.map((g) => g.enemyId)));
    for (let id = 0; id <= ENEMY_ID.DRAGON; id++) expect(used.has(id)).toBe(true);
  });

  it('캠페인 웨이브 공중 비율 — 보스·첫 등장 단독 웨이브를 빼면 공중 HP 비중 ≤ 480‰ (§L3-5, 생성 데이터 회귀)', () => {
    for (const stage of CAMPAIGN_STAGES) {
      stage.waves.forEach((wave, i) => {
        const hp = (g: { enemyId: number; hp: number; count: number }) => g.hp * g.count * ENEMIES[g.enemyId].swarm;
        const all = wave.groups.reduce((s, g) => s + hp(g), 0);
        const air = wave.groups.filter((g) => ENEMIES[g.enemyId].air).reduce((s, g) => s + hp(g), 0);
        const solo = new Set(wave.groups.map((g) => g.enemyId)).size === 1;
        const boss = i === stage.waves.length - 1 || wave.groups.some((g) => g.count === 1 && ENEMIES[g.enemyId].rank === 2);
        if (!solo && !boss) expect((air * 1000) / all).toBeLessThanOrEqual(480);
      });
    }
  });

  it('캠페인 §L2: 웨이브 6·8·8·8·10·10·10·12 · 시작 골드 · 상한 Lv3/4/5 · 스테이지마다 새 타워', () => {
    expect(CAMPAIGN_STAGES.map((s) => s.waves.length)).toEqual([6, 8, 8, 8, 10, 10, 10, 12]);
    expect(CAMPAIGN_STAGES.map((s) => s.startGold)).toEqual([220, 260, 300, 340, 380, 420, 460, 500]);
    expect(CAMPAIGN_STAGES.map((s) => s.maxLevel)).toEqual([3, 4, 4, 4, 5, 5, 5, 5]);
    expect(CAMPAIGN_STAGES.map((s) => s.towers.length)).toEqual([2, 3, 4, 5, 5, 6, 6, 6]);
    // 마지막 웨이브는 보스(호위 + 단일 대형), S8 최종은 용
    for (const stage of CAMPAIGN_STAGES) expect(stage.waves[stage.waves.length - 1].groups.some((g) => g.count === 1)).toBe(true);
    expect(CAMPAIGN_STAGES[7].waves[11].groups.some((g) => g.enemyId === ENEMY_ID.DRAGON)).toBe(true);
  });

  it('난이도 접미사 — 쉬움 HP 800·비용 850 / 어려움 HP 1200·비용 1080 (§L5) — 킬 보상은 난이도 HP 배율 전 기준이라 모드와 무관', () => {
    expect([findStage('s3')?.effects, findStage('s3')?.difficultyHp]).toEqual([[], 1000]);
    expect([findStage('s3-easy')?.effects.map((e) => e.value), findStage('s3-easy')?.difficultyHp]).toEqual([[850], 800]);
    expect([findStage('s3-hard')?.effects.map((e) => e.value), findStage('s3-hard')?.difficultyHp]).toEqual([[1080], 1200]);
    const rewards = (id: string) => {
      const state = createGame(findStage(id)!, 1);
      applyCommand(state, OP.CALL_WAVE);
      for (let t = 0; t < 400; t++) step(state);
      return state.enemies.map((e) => [e.maxHp, e.reward]);
    };
    const normal = rewards('s4');
    const hard = rewards('s4-hard');
    expect(hard.map((r) => r[1])).toEqual(normal.map((r) => r[1]));
    expect(hard.every((r, i) => r[0] >= normal[i][0])).toBe(true);
    expect(normal.every((r) => r[1] >= 1)).toBe(true);
    // 분열 새끼(파생)도 — 부모 최대 HP(난이도 배율 포함)에서 나오지만 보상은 모드와 무관
    const childRewards = (id: string, hp: number) => {
      const stage = findStage(id)!;
      const state = createGame(stage, 1);
      const parent = createEnemy(state, stage, { kind: ENEMY_ID.SPLITTER, hp, wave: 1, path: 0, dist: 1000, derived: false, rewardHp: 1000 }, null);
      state.projectiles.push(testProjectile(state, { targetId: parent.id, damage: 100000, damageType: 2 }));
      step(state);
      return state.enemies.filter((e) => e.kind === ENEMY_ID.SPLITLING).map((e) => [e.rewardHp, e.reward]);
    };
    const hardChildren = childRewards('s3-hard', 1200);
    expect(hardChildren).toHaveLength(3);
    expect(hardChildren).toEqual(childRewards('s3', 1000));
    expect(findStage('s3-hard')?.waves).toBe(findStage('s3')?.waves);
    expect(findStage('s9-hard')).toBeNull();
  });

  it('resolveBoard: 캠페인 = 스테이지 id · 무한 endless-s1 · 주간 weekly-YYYY-wNN — 그 밖은 null', () => {
    expect(resolveBoard('campaign', 'e1', 1)?.id).toBe('e1');
    expect(resolveBoard('campaign', 'nope', 1)).toBeNull();
    expect(resolveBoard('endless', 'e1', 1)).toBeNull();
    expect(resolveBoard('endless', 'endless-s2', 1)).toBeNull();
    expect(resolveBoard('weekly', 'weekly-2026-w00', 1)).toBeNull();
    expect(resolveBoard('versus', 'endless-s1', 1)).toBeNull();
    const endless = resolveBoard('endless', 'endless-s1', 5)!;
    expect([endless.id, endless.map.id, endless.waves.length, endless.augmentGuarantee, endless.rampFrom]).toEqual(['endless-s1', 'endless', MAX_WAVE, true, 30]);
    const weekly = resolveBoard('weekly', 'weekly-2026-w43', 5)!;
    expect([weekly.id, weekly.waves.length, weekly.augmentGuarantee]).toEqual(['weekly-2026-w43', MAX_WAVE, false]);
    expect(weekly.rules.length >= 2).toBe(true);
  });

  it('무한 웨이브: 같은 seed = 같은 구성 · seed가 다르면 구성이 다르다 · 정수·상한 안', () => {
    const a = resolveBoard('endless', 'endless-s1', 1)!.waves;
    expect(resolveBoard('endless', 'endless-s1', 1)!.waves).toEqual(a);
    expect(resolveBoard('endless', 'endless-s1', 2)!.waves).not.toEqual(a);
    for (const wave of a) {
      expect(wave.groups.length).toBeGreaterThan(0);
      for (const g of wave.groups) expect(Number.isInteger(g.hp) && g.hp > 0 && g.hp <= MAX_ENEMY_HP && g.count > 0).toBe(true);
    }
  });

  it('무한 압력: 설계 1~30 = 정적 표 · 31+ 램프는 같은 역할끼리 단조 증가', () => {
    expect(ENDLESS_DESIGNED_PRESSURE).toHaveLength(DESIGNED_WAVES);
    for (let n = 1; n <= DESIGNED_WAVES; n++) expect(endlessPressure(ENDLESS_DESIGNED_PRESSURE, n, ENDLESS_RAMP_PERMILLE)).toBe(ENDLESS_DESIGNED_PRESSURE[n - 1]);
    for (let n = DESIGNED_WAVES + 1; n + 5 <= MAX_WAVE; n++) {
      expect(endlessPressure(ENDLESS_DESIGNED_PRESSURE, n + 5, ENDLESS_RAMP_PERMILLE)).toBeGreaterThanOrEqual(endlessPressure(ENDLESS_DESIGNED_PRESSURE, n, ENDLESS_RAMP_PERMILLE));
    }
  });
});

describe('정수 안전 — 모든 중간값 < 2⁵³ (§E1)', () => {
  it('킬 보상 중간값: EHP(≤ HP × 2000 / 400) × G × K(1000‰) × 현상금 효과(‰)', () => {
    const maxEhp = Math.floor((MAX_ENEMY_HP * 2 * PERMILLE) / (2 * PERMILLE - 2 * RESIST_CAP_PERMILLE));
    expect(MAX_ENEMY_HP * 2 * PERMILLE).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(maxEhp * KILL_REWARD_G_CAMPAIGN * 1000).toBeLessThan(Number.MAX_SAFE_INTEGER);
    const maxReward = Math.floor((maxEhp * KILL_REWARD_G_CAMPAIGN) / 1000);
    expect(maxReward * 1300 * 1200).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it('피해: 최대 피해 × 효과·특수 배율(헤드샷 ×4·광선 ×3·순위 +100%·초전도·취약) — HP 상한 × ‰도', () => {
    const maxDamage = Math.max(...allStages().map((s) => s.stage.damage));
    // 광전사 ×1.25 · 날카로운 촉 ×1.25 · 헤드샷 ×4 · 광선 ×3 · 용사냥꾼 ×2 · 초전도 ×1.3 · 취약 +1000‰ 각각 ‰ 곱
    const worst = maxDamage * 1250 * 1250 * 4000 * 3000 * 2000 * 1300 * 2000;
    expect(worst / PERMILLE ** 6).toBeLessThan(Number.MAX_SAFE_INTEGER / PERMILLE);
    expect(MAX_ENEMY_HP * PERMILLE).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it('거리 제곱: 맵 대각선² · 최대 사거리²', () => {
    expect(MAP_E1.width ** 2 + MAP_E1.height ** 2).toBeLessThan(2 ** 31);
    expect(Math.max(...allStages().map((s) => s.stage.range)) ** 2).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
});
