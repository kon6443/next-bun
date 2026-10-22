import { describe, it, expect } from 'vitest';
import { injectEnemy, testProjectile } from '../engine-dev/fixtures';
import { offerAugments } from './augment';
import { enemySpeed, enemyStep, selectTarget } from './combat';
import {
  DAMAGE,
  EFFECT_OP,
  ELEMENT,
  EVENT,
  EVENT_STRIDE,
  FLAG,
  OP,
  RARITY,
  SCOPE,
  STAT,
  STATUS,
  TARGET,
} from './constants';
import { AUGMENTS } from './data/augments';
import { ENEMY_ID } from './data/enemies';
import { RULE_ID, ruleEffects } from './data/rules';
import { STAGE_E2, STAGE_E2_RULES, type Stage } from './data/stages';
import { TOWER_ID } from './data/towers';
import { computeDamage } from './damage';
import { type Effect, flagValue, hasFlag, statValue } from './effects';
import {
  type Enemy,
  type GameState,
  applyCommand,
  branchCost,
  buildCost,
  createGame,
  earlyCallBonus,
  sellRefund,
  step,
  upgradeCost,
} from './game';
import { groupSpawnCount, slotAvailable, towerSubject } from './state';
import { type StatusSource, applyStatus, tickStatuses } from './status';

// ==================== 시험 도구 ====================

function arena(stage: Stage = STAGE_E2, seed = 1): GameState {
  const s = createGame(stage, seed);
  s.gold = 1000000;
  return s;
}

/** 슬롯에 타워를 지어 level(·branch 1·2)까지 올린다 */
function build(s: GameState, slot: number, kind: number, level = 1, branch = 0): void {
  expect(applyCommand(s, OP.BUILD, slot, kind)).toBe(true);
  for (let l = 2; l <= level; l++) {
    if (l === 4) expect(applyCommand(s, OP.BRANCH, slot, branch - 1)).toBe(true);
    else expect(applyCommand(s, OP.UPGRADE, slot)).toBe(true);
  }
  s.towers[s.towers.length - 1].cooldown = 0; // 바로 쏠 수 있게 — 건설 지연은 별도 테스트
}

/** 움직이지 않는 적 (기절 — 능력도 멈춘다) */
function frozen(s: GameState, dist: number, hp = 1000000, kind: number = ENEMY_ID.GRUNT, path = 0): Enemy {
  const e = injectEnemy(s, STAGE_E2, dist, hp, kind, path);
  e.stunTicks = 1000000;
  e.afflicted = true;
  return e;
}

function steps(s: GameState, n: number, events: number[] | null = null): void {
  for (let i = 0; i < n; i++) step(s, events);
}

/** 이벤트 버퍼에서 종류별 [a, b, c] */
function eventsOf(events: number[], kind: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < events.length; i += EVENT_STRIDE) if (events[i] === kind) out.push(events.slice(i + 1, i + 4));
  return out;
}

const FROST_SOURCE: StatusSource = { subject: towerSubject(TOWER_ID.FROST, ELEMENT.ICE), sourceKey: 101, plague: false, curseExplode: 0 };
const source = (sourceKey: number, kind: number = TOWER_ID.CANNON): StatusSource => ({ ...FROST_SOURCE, subject: towerSubject(kind, ELEMENT.NONE), sourceKey });
const rulesFlag = (flag: number, value = 0): Effect => ({ scope: SCOPE.RULES, target: 0, stat: flag, op: EFFECT_OP.FLAG, value });

// ==================== 효과 엔진 (§C6) ====================

describe('효과 엔진', () => {
  const T = towerSubject(TOWER_ID.ARCHER, ELEMENT.NONE);
  it('곱(‰, 하나씩 내림) → 더하기 → 덮어쓰기, 목록 순서 무관하게 단계 고정 · 0 미만은 0', () => {
    const mul = { scope: SCOPE.ALL_TOWERS, target: 0, stat: STAT.DAMAGE, op: EFFECT_OP.MUL, value: 1250 };
    const add = { ...mul, op: EFFECT_OP.ADD, value: 10 };
    expect(statValue([add, mul, mul], T, STAT.DAMAGE, 33)).toBe(Math.floor(Math.floor((33 * 1250) / 1000) * 1250 / 1000) + 10);
    expect(statValue([mul, { ...mul, op: EFFECT_OP.SET, value: 5 }, add], T, STAT.DAMAGE, 33)).toBe(5);
    expect(statValue([{ ...add, value: -100 }], T, STAT.DAMAGE, 33)).toBe(0);
  });

  it('범위: 타워 id · 원소 태그 · 전체 타워 · 적 · 경제는 서로 섞이지 않는다', () => {
    const e = (scope: number, target: number) => ({ scope, target, stat: STAT.DAMAGE, op: EFFECT_OP.ADD, value: 1 });
    const fire = towerSubject(TOWER_ID.CANNON, ELEMENT.FIRE);
    expect(statValue([e(SCOPE.TOWER, TOWER_ID.CANNON)], fire, STAT.DAMAGE, 0)).toBe(1);
    expect(statValue([e(SCOPE.TOWER, TOWER_ID.MAGE)], fire, STAT.DAMAGE, 0)).toBe(0);
    expect(statValue([e(SCOPE.TOWER_TAG, ELEMENT.FIRE)], fire, STAT.DAMAGE, 0)).toBe(1);
    expect(statValue([e(SCOPE.TOWER_TAG, ELEMENT.ICE)], fire, STAT.DAMAGE, 0)).toBe(0);
    expect(statValue([e(SCOPE.ALL_TOWERS, 0)], { tower: -1, element: -1, enemy: -1 }, STAT.DAMAGE, 0)).toBe(0);
    expect(statValue([e(SCOPE.ALL_ENEMIES, 0)], fire, STAT.DAMAGE, 0)).toBe(0);
  });

  it('특정 적(ENEMY) 범위 효과는 종류 무관 수치(그룹 수)에 섞이지 않고, 모든 적(ALL_ENEMIES)만 섞인다', () => {
    const s = arena();
    s.effects.push({ scope: SCOPE.ENEMY, target: ENEMY_ID.GRUNT, stat: STAT.ENEMY_COUNT, op: EFFECT_OP.MUL, value: 500 });
    expect(groupSpawnCount(s, 6)).toBe(6);
    s.effects.push({ scope: SCOPE.ALL_ENEMIES, target: 0, stat: STAT.ENEMY_COUNT, op: EFFECT_OP.MUL, value: 500 });
    expect(groupSpawnCount(s, 6)).toBe(3);
  });

  it('플래그: 켜졌는지·마지막 인자', () => {
    expect(hasFlag([], FLAG.NO_SELL)).toBe(false);
    expect(flagValue([rulesFlag(FLAG.BANNED_TOWER, 2), rulesFlag(FLAG.BANNED_TOWER, 5)], FLAG.BANNED_TOWER)).toBe(5);
  });
});

// ==================== 피해식 (§C1) ====================

describe('피해식 — 저항·파쇄·취약·시너지', () => {
  it('저항: 방패병 물리 500 · 마법 0 · 고정 피해는 무시 · 상한 800 · 최소 1', () => {
    const s = arena();
    const shield = frozen(s, 1000, 1000, ENEMY_ID.SHIELD);
    expect(computeDamage(s, shield, 100, DAMAGE.PHY, ELEMENT.NONE)).toBe(50);
    expect(computeDamage(s, shield, 100, DAMAGE.MAG, ELEMENT.NONE)).toBe(100);
    shield.resistPhy = 950;
    expect(computeDamage(s, shield, 100, DAMAGE.PHY, ELEMENT.NONE)).toBe(20);
    expect(computeDamage(s, shield, 100, DAMAGE.PURE, ELEMENT.NONE)).toBe(100);
    expect(computeDamage(s, shield, 1, DAMAGE.PHY, ELEMENT.NONE)).toBe(1);
  });

  it('파쇄는 물리 저항만 깎고(합계 상한 500), 취약은 마지막에 곱한다', () => {
    const s = arena();
    const shield = frozen(s, 1000, 1000, ENEMY_ID.SHIELD);
    applyStatus(s, shield, { status: STATUS.SHRED, value: 300, ticks: 150 }, source(1), null);
    expect(computeDamage(s, shield, 100, DAMAGE.PHY, ELEMENT.NONE)).toBe(80);
    applyStatus(s, shield, { status: STATUS.VULNERABLE, value: 200, ticks: 90 }, source(2), null);
    expect(computeDamage(s, shield, 100, DAMAGE.PHY, ELEMENT.NONE)).toBe(96);
    expect(computeDamage(s, shield, 100, DAMAGE.MAG, ELEMENT.NONE)).toBe(120);
  });

  it('초전도(번개 × 감속 +30%) · 서리 파쇄(감속 시 물리 저항 −150) · 원소 융합(상태 2종 이상 +20%)', () => {
    const s = arena();
    const shield = frozen(s, 1000, 1000, ENEMY_ID.SHIELD); // 기절 1종
    applyStatus(s, shield, { status: STATUS.SLOW, value: 300, ticks: 45 }, FROST_SOURCE, null);
    expect(computeDamage(s, shield, 100, DAMAGE.MAG, ELEMENT.LIGHTNING)).toBe(100);
    s.effects.push(...AUGMENTS[13].effects, ...AUGMENTS[7].effects);
    expect(computeDamage(s, shield, 100, DAMAGE.MAG, ELEMENT.LIGHTNING)).toBe(130);
    expect(computeDamage(s, shield, 100, DAMAGE.PHY, ELEMENT.NONE)).toBe(65);
    s.effects.push(...AUGMENTS[16].effects);
    expect(computeDamage(s, shield, 100, DAMAGE.MAG, ELEMENT.NONE)).toBe(120);
  });
});

// ==================== 상태효과 (§C3) ====================

describe('상태효과 중첩 규칙', () => {
  it('감속: 가장 강한 1개 — 약한 재적용은 무시(지속도 늘리지 않음)·같은 세기는 긴 지속·강하면 값·지속 교체 · 보스 50% · 혹한 +100 · 이동 하한 300‰', () => {
    const s = arena();
    const g = frozen(s, 1000);
    applyStatus(s, g, { status: STATUS.SLOW, value: 300, ticks: 45 }, FROST_SOURCE, null);
    applyStatus(s, g, { status: STATUS.SLOW, value: 200, ticks: 90 }, FROST_SOURCE, null);
    expect([g.slow, g.slowTicks]).toEqual([300, 45]);
    applyStatus(s, g, { status: STATUS.SLOW, value: 300, ticks: 90 }, FROST_SOURCE, null);
    expect([g.slow, g.slowTicks]).toEqual([300, 90]);
    applyStatus(s, g, { status: STATUS.SLOW, value: 500, ticks: 10 }, FROST_SOURCE, null);
    expect([g.slow, g.slowTicks]).toEqual([500, 10]);
    g.slow = 300;
    const boss = frozen(s, 1000, 1000, ENEMY_ID.SUMMONER);
    applyStatus(s, boss, { status: STATUS.SLOW, value: 400, ticks: 45 }, FROST_SOURCE, null);
    expect(boss.slow).toBe(200);
    s.effects.push(...AUGMENTS[6].effects);
    applyStatus(s, g, { status: STATUS.SLOW, value: 300, ticks: 45 }, FROST_SOURCE, null);
    expect(g.slow).toBe(400);
    g.stunTicks = 0;
    g.slow = 900;
    expect(enemyStep(g, enemySpeed(s, g.kind))).toBe(Math.floor((33 * 300) / 1000));
  });

  it('기절: 120틱 안 1·2·3·4회째 100·50·25·0% · 보스는 1회차부터 50% · 창이 지나면 초기화', () => {
    const s = arena();
    const g = injectEnemy(s, STAGE_E2, 1000);
    const boss = injectEnemy(s, STAGE_E2, 1000, 1000, ENEMY_ID.SUMMONER);
    const events: number[] = [];
    for (const e of [g, boss]) for (let i = 0; i < 4; i++) applyStatus(s, e, { status: STATUS.STUN, value: 0, ticks: 30 }, FROST_SOURCE, events);
    expect(eventsOf(events, EVENT.STATUS).map((e) => e[2])).toEqual([30, 15, 7, 0, 15, 7, 3, 0]);
    expect(g.stunTicks).toBe(30);
    s.tick += 120;
    events.length = 0;
    applyStatus(s, g, { status: STATUS.STUN, value: 0, ticks: 30 }, FROST_SOURCE, events);
    expect(eventsOf(events, EVENT.STATUS)[0][2]).toBe(30);
  });

  it('화상: 출처 타워당 1스택·최대 3 · 가득 차면 가장 약한 스택 교체 · 업화(지속 ×1.5, 스택 +2)', () => {
    const s = arena();
    const g = frozen(s, 1000);
    for (const id of [1, 2, 3, 1]) applyStatus(s, g, { status: STATUS.BURN, value: 6, ticks: 60 }, source(id), null);
    expect(g.burnSources).toEqual([1, 2, 3]);
    applyStatus(s, g, { status: STATUS.BURN, value: 5, ticks: 60 }, source(4), null);
    expect(g.burnSources).toEqual([1, 2, 3]);
    applyStatus(s, g, { status: STATUS.BURN, value: 10, ticks: 60 }, source(4), null);
    expect([g.burnSources, g.burnDps]).toEqual([[4, 2, 3], [10, 6, 6]]);
    s.effects.push(...AUGMENTS[12].effects);
    for (const id of [5, 6]) applyStatus(s, g, { status: STATUS.BURN, value: 6, ticks: 60 }, source(id), null);
    expect(g.burnSources).toEqual([4, 2, 3, 5, 6]);
    expect(g.burnTicks[3]).toBe(90);
    // 6번째 — 같은 피해면 남은 틱이 짧은 쪽(2)을 바꾼다
    applyStatus(s, g, { status: STATUS.BURN, value: 6, ticks: 60 }, source(7), null);
    expect(g.burnSources).toEqual([4, 7, 3, 5, 6]);
  });

  it('중독: 타워 상한까지 가산·재적용 시 지속 갱신 · 맹독 +4', () => {
    const s = arena();
    const g = frozen(s, 1000);
    const poison = { status: STATUS.POISON, value: 2, ticks: 90, cap: 6 };
    for (let i = 0; i < 8; i++) applyStatus(s, g, poison, source(1, TOWER_ID.ARCHER), null);
    expect(g.poisonStacks).toBe(6);
    s.effects.push(...AUGMENTS[14].effects);
    for (let i = 0; i < 8; i++) applyStatus(s, g, poison, source(1, TOWER_ID.ARCHER), null);
    expect(g.poisonStacks).toBe(10);
  });

  it('파쇄 가산(상한 500) · 취약 가장 강한 1개 · 약점 공략 지속 ×1.5', () => {
    const s = arena();
    const g = frozen(s, 1000);
    for (let i = 0; i < 2; i++) applyStatus(s, g, { status: STATUS.SHRED, value: 300, ticks: 150 }, source(1), null);
    expect(g.shred).toBe(500);
    applyStatus(s, g, { status: STATUS.VULNERABLE, value: 200, ticks: 45 }, source(1), null);
    applyStatus(s, g, { status: STATUS.VULNERABLE, value: 150, ticks: 45 }, source(1), null);
    expect(g.vulnerable).toBe(200);
    s.effects.push(...AUGMENTS[15].effects);
    applyStatus(s, g, { status: STATUS.VULNERABLE, value: 200, ticks: 90 }, source(1), null);
    expect(g.vulnerableTicks).toBe(135);
  });

  it('저주 폭발은 저주 자기 지속 동안만 — 다른 취약(서리)이 계속 걸려도 저주가 끝나면 사라진다', () => {
    const s = arena();
    const g = frozen(s, 1000);
    const curse = { ...source(5, TOWER_ID.MAGE), curseExplode: 150 };
    applyStatus(s, g, { status: STATUS.VULNERABLE, value: 150, ticks: 90 }, curse, null);
    const deaths: Enemy[] = [];
    for (let t = 0; t < 120; t++) {
      if (t % 30 === 0) applyStatus(s, g, { status: STATUS.VULNERABLE, value: 200, ticks: 45 }, source(6, TOWER_ID.FROST), null);
      tickStatuses(s, g, deaths, null);
      s.tick += 1;
    }
    expect(g.vulnerable).toBe(200);
    expect([g.curseExplode, g.curseTicks]).toEqual([0, 0]);
  });

  it('지속 피해 30틱마다: 화상 = 마법(저항 적용) · 중독 = 고정 / 지속이 끝나면 풀린다', () => {
    const s = arena();
    const priest = frozen(s, 1000, 1000, ENEMY_ID.PRIEST); // 마법 저항 500
    applyStatus(s, priest, { status: STATUS.BURN, value: 10, ticks: 60 }, source(1), null);
    applyStatus(s, priest, { status: STATUS.POISON, value: 2, ticks: 45, cap: 3 }, source(2, TOWER_ID.ARCHER), null);
    applyStatus(s, priest, { status: STATUS.POISON, value: 2, ticks: 45, cap: 3 }, source(2, TOWER_ID.ARCHER), null);
    const deaths: Enemy[] = [];
    // step 3단계처럼 — 갱신 뒤 틱이 1 오른다
    const tick = (n: number) => {
      for (let t = 0; t < n; t++) {
        tickStatuses(s, priest, deaths, null);
        s.tick += 1;
      }
    };
    tick(29);
    expect(priest.hp).toBe(1000);
    tick(1);
    expect(priest.hp).toBe(1000 - 5 - 4);
    tick(30);
    expect(priest.hp).toBe(1000 - 9 - 5); // 중독은 45틱에 끝나고, 화상은 60틱째 마지막으로 한 번 더
    expect([priest.burnSources.length, priest.poisonStacks]).toEqual([0, 0]);
  });
});

// ==================== 표적 (§C2) ====================

describe('표적 — 다중 경로 "선두" = 출구까지 남은 거리 최소 (D-025)', () => {
  it('선두는 다른 갈래라도 남은 거리가 짧은 적 · 후미는 반대 · 동률은 진행 거리 큰 순 → 생성 순', () => {
    const s = arena();
    const a = frozen(s, 10000, 1000, ENEMY_ID.GRUNT, 0); // 남은 8000
    const b = frozen(s, 11000, 1000, ENEMY_ID.GRUNT, 1); // 남은 7000
    const index = (mode: number) => selectTarget(s, 4500, 9000, 100000, true, true, mode);
    expect(s.enemies[index(TARGET.FIRST)]).toBe(b);
    expect(s.enemies[index(TARGET.LAST)]).toBe(a);
    const air = frozen(s, 8000, 1000, ENEMY_ID.BATS, 0); // 공중 경로 15000 — 남은 7000
    expect(s.enemies[index(TARGET.FIRST)]).toBe(b); // 동률 → 진행 거리 큰 지상
    // 진행 거리는 짧아도 남은 거리가 더 짧으면 선두 (진행 거리 기준이면 b가 뽑힌다)
    const shortcut = frozen(s, 10500, 1000, ENEMY_ID.BATS, 0); // 남은 4500
    expect(s.enemies[index(TARGET.FIRST)]).toBe(shortcut);
    shortcut.status = 1;
    const twin = frozen(s, 11000, 1000, ENEMY_ID.GRUNT, 1);
    expect(s.enemies[index(TARGET.FIRST)]).toBe(b); // 완전 동률 → 생성 순번 작은 쪽
    expect(twin.id).toBeGreaterThan(b.id);
    expect(s.enemies[selectTarget(s, 4500, 9000, 100000, false, true, TARGET.FIRST)]).toBe(air);
  });
});

// ==================== 타워 공격 (§C4) ====================

describe('타워 공격 형태', () => {
  it('서리탑 펄스: 반경 안 전부 마법 피해 + 감속, 반경 밖은 그대로', () => {
    const s = arena();
    build(s, 0, TOWER_ID.FROST);
    const near = frozen(s, 2500, 100);
    const far = frozen(s, 5000, 100);
    const events: number[] = [];
    step(s, events);
    expect([near.hp, near.slow, far.hp]).toEqual([95, 300, 100]);
    expect(eventsOf(events, EVENT.PULSE)).toHaveLength(1);
  });

  it('테슬라 연쇄: 3마리, 튈 때마다 −25% (가장 가까운 다음 대상)', () => {
    const s = arena();
    build(s, 0, TOWER_ID.TESLA);
    const [a, b, c] = [frozen(s, 2500, 100), frozen(s, 3000, 100), frozen(s, 3500, 100)];
    step(s);
    expect([c.hp, b.hp, a.hp]).toEqual([91, 94, 96]);
  });

  it('고전압 연쇄 +1 · 축전 감소 0', () => {
    const s = arena();
    build(s, 0, TOWER_ID.TESLA);
    s.effects.push(...AUGMENTS[10].effects, ...AUGMENTS[11].effects);
    const list = [frozen(s, 2000, 100), frozen(s, 2500, 100), frozen(s, 3000, 100), frozen(s, 3500, 100)];
    step(s);
    expect(list.map((e) => e.hp)).toEqual([91, 91, 91, 91]);
  });

  it('비전 광선(4A): 같은 대상 유지 시 초당 +25%, 최대 ×2', () => {
    const s = arena();
    build(s, 0, TOWER_ID.MAGE, 4, 1);
    const g = frozen(s, 2500);
    const events: number[] = [];
    steps(s, 30 * 5 + 1, events);
    expect(eventsOf(events, EVENT.HIT).map((h) => h[1])).toEqual([41, 51, 61, 71, 82, 82]);
    expect(g.hp).toBe(1000000 - (41 + 51 + 61 + 71 + 82 + 82));
  });

  it('헤드샷(5A): 5발째마다 ×4, 최강 우선으로 바뀐다', () => {
    const s = arena();
    build(s, 0, TOWER_ID.ARCHER, 5, 1);
    expect(s.towers[0].targetMode).toBe(TARGET.STRONGEST);
    frozen(s, 2500);
    const events: number[] = [];
    steps(s, 30 * 4 + 10, events);
    expect(eventsOf(events, EVENT.HIT).map((h) => h[1])).toEqual([55, 55, 55, 55, 220]);
  });

  it('공성포(4B): 엘리트·보스 +50% (저항 전) · 일반은 그대로', () => {
    const s = arena();
    build(s, 0, TOWER_ID.CANNON, 4, 2);
    const giant = frozen(s, 2500, 100000, ENEMY_ID.GIANT);
    steps(s, 10);
    expect(giant.hp).toBe(100000 - Math.floor((165 * 600) / 1000));
  });

  it('철갑포탄(5B): 3발째마다 파쇄 300‰', () => {
    const s = arena();
    build(s, 0, TOWER_ID.CANNON, 5, 2);
    const g = frozen(s, 2500);
    steps(s, 75 * 1 + 10);
    expect(g.shred).toBe(0);
    steps(s, 75 * 1);
    expect(g.shred).toBe(300);
  });

  it('대공 석궁은 공중만 — 대지 겨냥(증강)이면 지상도 50%', () => {
    const s = arena();
    build(s, 0, TOWER_ID.CROSSBOW);
    const g = frozen(s, 2500, 1000);
    steps(s, 20);
    expect(g.hp).toBe(1000);
    s.effects.push(...AUGMENTS[9].effects);
    steps(s, 20);
    expect(g.hp).toBe(1000 - 16);
  });

  it('공명(증강): 마법탑 첫 대상 근처 두 번째 대상에 50%', () => {
    const s = arena();
    build(s, 0, TOWER_ID.MAGE);
    s.effects.push(...AUGMENTS[5].effects);
    const back = frozen(s, 2000, 100);
    const front = frozen(s, 3000, 100);
    step(s);
    expect([front.hp, back.hp]).toEqual([85, 93]);
  });

  it('세 번째 화살(증강): 3발째마다 표적 포함 2마리(추가 1)', () => {
    const s = arena();
    build(s, 0, TOWER_ID.ARCHER);
    s.effects.push(...AUGMENTS[1].effects);
    const back = frozen(s, 2500, 100);
    const near = frozen(s, 2600, 100);
    const lead = frozen(s, 3200, 100); // 선두 = 표적
    steps(s, 45);
    // 3발 모두 선두에, 3발째만 가장 가까운 near를 함께 꿰뚫는다
    expect([lead.hp, near.hp, back.hp]).toEqual([76, 92, 100]);
  });

  it('공명은 광선(4A)에도 · 고전압 연쇄 +1은 궁극 폭풍 코일에도', () => {
    const s = arena();
    build(s, 0, TOWER_ID.MAGE, 4, 1);
    s.effects.push(...AUGMENTS[5].effects);
    const back = frozen(s, 2000, 100);
    frozen(s, 3000, 100000);
    step(s);
    expect(back.hp).toBe(100 - Math.floor((41 * 500) / 1000));

    const t = arena();
    build(t, 0, TOWER_ID.TESLA, 5, 1);
    t.effects.push(...AUGMENTS[10].effects);
    const list = Array.from({ length: 11 }, (_, i) => frozen(t, 500 + i * 400));
    const events: number[] = [];
    steps(t, 240, events);
    // 궁극 연쇄 10 + 1 = 11마리 — 마지막 연쇄 이벤트 수로 센다(궁극 발동 틱의 CHAIN 이벤트)
    expect(list.every((e) => e.hp < 1000000)).toBe(true);
  });

  it('범위탄은 표적이 먼저 죽으면 마지막 위치에서 터지고, 단일탄은 사라진다', () => {
    const s = arena();
    const g = frozen(s, 2500, 100);
    s.projectiles.push(testProjectile(s, { towerKind: TOWER_ID.CANNON, targetId: 9999, damage: 14, splash: 1000, aimX: g.x, aimY: g.y + 500 }));
    s.projectiles.push(testProjectile(s, { targetId: 9998, damage: 50, aimX: g.x, aimY: g.y }));
    step(s);
    expect(g.hp).toBe(86);
  });

  it('철갑 볼트(4B): 표적 근처 2마리 관통(1칸) + 파쇄', () => {
    const s = arena();
    const bats = [5000, 5500, 5900, 7000].map((d) => frozen(s, d, 1000, ENEMY_ID.BATS));
    s.projectiles.push(testProjectile(s, { towerKind: TOWER_ID.CROSSBOW, level: 4, branch: 2, targetId: bats[0].id, damage: 120, pierce: 2 }));
    step(s);
    expect(bats.map((b) => b.hp)).toEqual([880, 880, 880, 1000]);
    expect(bats.map((b) => b.shred)).toEqual([200, 200, 200, 0]);
  });

  it('화염지대(5A): 착탄 지점 60틱 장판 — 안에 들어온 지상 적에 화상', () => {
    const s = arena();
    const g = frozen(s, 2500, 100000);
    s.projectiles.push(testProjectile(s, { towerId: 77, slot: 4, towerKind: TOWER_ID.CANNON, level: 5, branch: 1, targetId: g.id, damage: 60, splash: 1200 }));
    step(s);
    expect(s.zones).toHaveLength(1);
    expect(s.zones[0]).toMatchObject({ radius: 1200, ticksLeft: 60 });
    const late = frozen(s, 3000, 100000);
    step(s);
    expect(late.burnSources).toEqual([5]); // 출처 키 = 슬롯 + 1
    // 같은 슬롯에 판매·재건설한 타워(새 id)의 화상은 같은 출처 — 스택이 늘지 않는다
    s.projectiles.push(testProjectile(s, { towerId: 99, slot: 4, towerKind: TOWER_ID.CANNON, level: 5, branch: 1, targetId: late.id, damage: 60, splash: 1200 }));
    step(s);
    expect(late.burnSources).toEqual([5]);
    steps(s, 60);
    expect(s.zones).toHaveLength(0);
  });

  it('여진(증강): 착탄 지점 30틱 감속 300‰ — 다음 틱 이동에 반영', () => {
    const s = arena();
    const g = injectEnemy(s, STAGE_E2, 2500, 100000);
    s.projectiles.push(testProjectile(s, { towerKind: TOWER_ID.CANNON, targetId: g.id, damage: 14, splash: 1000, aftershock: true }));
    step(s);
    const before = g.dist;
    step(s);
    expect(g.dist - before).toBe(Math.floor((33 * 700) / 1000));
  });

  it('궁극 눈보라(서리 5A): 300틱마다 반경 3.5칸 감속 600 — 대상이 없으면 준비 상태로 기다린다', () => {
    const s = arena();
    build(s, 0, TOWER_ID.FROST, 5, 1);
    expect(s.towers[0].ultTimer).toBe(300);
    steps(s, 400);
    expect(s.towers[0].ultTimer).toBe(0);
    const g = frozen(s, 2500);
    const events: number[] = [];
    step(s, events);
    expect(eventsOf(events, EVENT.PULSE).some((p) => p[2] === 1)).toBe(true);
    expect(g.slow).toBe(600);
    expect(s.towers[0].ultTimer).toBe(300);
  });

  it('궁극 폭풍 코일(테슬라 5A): 240틱마다 10연쇄', () => {
    const s = arena();
    build(s, 0, TOWER_ID.TESLA, 5, 1);
    const list = [1500, 2000, 2500, 3000, 3500].map((d) => frozen(s, d));
    const events: number[] = [];
    steps(s, 240, events);
    expect(eventsOf(events, EVENT.PULSE).filter((p) => p[2] === 1)).toHaveLength(1);
    expect(list.every((e) => e.hp < 1000000)).toBe(true);
  });
});

// ==================== 적 능력 (§C5) ====================

describe('적 능력', () => {
  it('소환사: 180틱마다 졸개 3(최대 HP 40‰) — 웨이브 집계에 더한다 · 기절 중엔 멈춘다', () => {
    const s = arena();
    const boss = injectEnemy(s, STAGE_E2, 0, 1000, ENEMY_ID.SUMMONER);
    const total = s.waves[0].total;
    steps(s, 179);
    expect(s.enemies).toHaveLength(1);
    step(s);
    const minions = s.enemies.filter((e) => e.kind === ENEMY_ID.GRUNT);
    expect(minions.map((e) => [e.hp, e.derived, e.dist])).toEqual(Array(3).fill([40, true, boss.dist]));
    expect(s.waves[0].total).toBe(total + 3);
    boss.stunTicks = 1000;
    boss.afflicted = true;
    steps(s, 200);
    expect(s.enemies.filter((e) => e.kind === ENEMY_ID.GRUNT)).toHaveLength(3);
  });

  it('사제: 30틱마다 1.5칸 안 아군 최대 HP 3% 회복(자신 제외, 최대 HP까지)', () => {
    const s = arena();
    const priest = injectEnemy(s, STAGE_E2, 1000, 100, ENEMY_ID.PRIEST);
    const g = injectEnemy(s, STAGE_E2, 1000, 100);
    priest.hp = 50;
    g.hp = 99;
    steps(s, 30);
    expect([priest.hp, g.hp]).toEqual([50, 100]);
  });

  it('용: HP 50% 이하에서 저항 뒤바뀜 + 박쥐 떼 2묶음(10마리)', () => {
    const s = arena();
    const dragon = injectEnemy(s, STAGE_E2, 1000, 1000, ENEMY_ID.DRAGON);
    step(s);
    expect(dragon.phase).toBe(0);
    dragon.hp = 500;
    step(s);
    expect([dragon.phase, dragon.resistPhy, dragon.resistMag]).toEqual([1, 0, 600]);
    const bats = s.enemies.filter((e) => e.kind === ENEMY_ID.BATS);
    expect(bats).toHaveLength(10);
    expect(bats.every((b) => b.air && b.hp === 20)).toBe(true);
  });
});

// ==================== 사망 효과 ====================

describe('사망 효과 (§E2-8)', () => {
  const kill = (s: GameState, e: Enemy) => s.projectiles.push(testProjectile(s, { targetId: e.id, damage: 1000000, damageType: DAMAGE.PURE }));

  it('분열체: 사망 시 새끼 3(250‰) — 부모 위치·웨이브 집계', () => {
    const s = arena();
    const splitter = injectEnemy(s, STAGE_E2, 1000, 100, ENEMY_ID.SPLITTER);
    const { total, pending } = s.waves[0];
    kill(s, splitter);
    step(s);
    const kids = s.enemies.filter((e) => e.kind === ENEMY_ID.SPLITLING);
    expect(kids.map((k) => [k.hp, k.dist, k.derived])).toEqual(Array(3).fill([25, splitter.dist, true]));
    expect([s.waves[0].total, s.waves[0].pending, s.kills]).toEqual([total + 3, pending - 1 + 3, 1]);
  });

  it('출구에서 처치한 분열체는 새끼를 남기지 않는다 — 처치가 방치보다 목숨을 더 잃지 않게', () => {
    const s = arena();
    const splitter = injectEnemy(s, STAGE_E2, 18000, 100, ENEMY_ID.SPLITTER);
    kill(s, splitter);
    step(s);
    expect(s.enemies.filter((e) => e.kind === ENEMY_ID.SPLITLING)).toHaveLength(0);
    expect(s.lives).toBe(20);
  });

  it('증식(R5): 지상·파생 아닌 적만 졸개 1(최대 HP 1/4) — 확률은 전투 스트림', () => {
    const s = arena();
    s.effects.push(rulesFlag(FLAG.SPLIT_ON_DEATH, 1000));
    const g = injectEnemy(s, STAGE_E2, 1000, 100);
    const bat = injectEnemy(s, STAGE_E2, 1000, 100, ENEMY_ID.BATS);
    const rng = s.rngCombat;
    kill(s, g);
    kill(s, bat);
    step(s);
    const child = s.enemies.filter((e) => e.status === 0 && e.kind === ENEMY_ID.GRUNT);
    expect(child.map((c) => [c.hp, c.derived])).toEqual([[25, true]]);
    expect(s.rngCombat).not.toBe(rng);
    kill(s, child[0]);
    step(s);
    expect(s.enemies.filter((e) => e.status === 0 && e.kind === ENEMY_ID.GRUNT)).toHaveLength(0);
  });

  it('역병: 역병 중독된 적이 죽으면 1.5칸 안에 중독 전염', () => {
    const s = arena();
    const victim = frozen(s, 1000, 100);
    const near = frozen(s, 2000, 100);
    const far = frozen(s, 3000, 100);
    victim.plague = true;
    kill(s, victim);
    step(s);
    expect([near.poisonStacks, near.plague, far.poisonStacks]).toEqual([1, true, 0]);
  });

  it('저주 폭발: 저주받은 적 사망 시 최대 HP 15% 범위 마법 피해', () => {
    const s = arena();
    const victim = frozen(s, 1000, 1000);
    const near = frozen(s, 2000, 1000);
    victim.curseExplode = 150;
    kill(s, victim);
    step(s);
    expect(near.hp).toBe(850);
  });

  it('산산조각(서리 5B): 감속·기절 중 처치면 2칸 파편 30 — 아니면 없음', () => {
    const run = (stunVictim: boolean) => {
      const s = arena();
      build(s, 0, TOWER_ID.FROST, 5, 2);
      const victim = injectEnemy(s, STAGE_E2, 2500, 1);
      if (stunVictim) {
        victim.stunTicks = 100;
        victim.afflicted = true;
      }
      const neighbor = frozen(s, 4400, 1000);
      step(s);
      expect(victim.status).toBe(1);
      return neighbor.hp;
    };
    expect(run(true)).toBe(970);
    expect(run(false)).toBe(1000);
  });
});

// ==================== 명령·경제 (§E3·§L4) ====================

describe('명령 — 분기·상한·금지·슬롯', () => {
  it('Lv3에서 UPGRADE는 거부, BRANCH로 Lv4 → UPGRADE로 Lv5 (투자 580)', () => {
    const s = arena();
    build(s, 0, TOWER_ID.ARCHER, 3);
    expect(upgradeCost(s, 0)).toBe(0);
    expect(applyCommand(s, OP.UPGRADE, 0)).toBe(false);
    expect(branchCost(s, 0, 1)).toBe(140);
    expect(applyCommand(s, OP.BRANCH, 0, 1)).toBe(true);
    expect(applyCommand(s, OP.BRANCH, 0, 0)).toBe(false);
    expect(upgradeCost(s, 0)).toBe(240);
    expect(applyCommand(s, OP.UPGRADE, 0)).toBe(true);
    expect(s.towers[0]).toMatchObject({ level: 5, branch: 2, invested: 580 });
    expect(applyCommand(s, OP.UPGRADE, 0)).toBe(false);
  });

  it('규칙 아레나: 금지 타워(테슬라) 건설 거부 · 천장(Lv4)에서 UPGRADE 거부 · 부자 출발 골드 ×2', () => {
    const s = createGame(STAGE_E2_RULES, 1);
    expect(s.gold).toBe(STAGE_E2.startGold * 2);
    expect(applyCommand(s, OP.BUILD, 0, TOWER_ID.TESLA)).toBe(false);
    s.gold = 100000;
    build(s, 0, TOWER_ID.ARCHER, 4, 1);
    expect(applyCommand(s, OP.UPGRADE, 0)).toBe(false);
  });

  it('잠긴 슬롯은 개척(증강) 수만큼 앞에서부터 열리고, 좁은 땅(R9)은 열린 슬롯 뒤에서 2개를 막는다', () => {
    const s = arena();
    expect(applyCommand(s, OP.BUILD, 12, TOWER_ID.ARCHER)).toBe(false);
    s.effects.push(...AUGMENTS[23].effects);
    expect([slotAvailable(s, STAGE_E2, 12), slotAvailable(s, STAGE_E2, 13)]).toEqual([true, false]);
    s.effects.push(...ruleEffects(RULE_ID.NARROW, -1));
    expect([9, 10, 11, 12].map((i) => slotAvailable(s, STAGE_E2, i))).toEqual([true, false, false, true]);
    expect(applyCommand(s, OP.BUILD, 11, TOWER_ID.ARCHER)).toBe(false);
  });
});

describe('경제 — 비용·판매·조기 호출·보상 효과', () => {
  it('할인 계약: 비용 ×0.8 · 목숨 −5 (최소 1)', () => {
    const s = arena();
    s.augmentPending = true;
    s.augmentChoices = [20];
    expect(applyCommand(s, OP.PICK_AUGMENT, 0)).toBe(true);
    expect([s.lives, buildCost(s, TOWER_ID.ARCHER), s.augments]).toEqual([15, 56, [20]]);
    s.lives = 3;
    s.augments = [];
    s.augmentPending = true;
    s.augmentChoices = [20];
    applyCommand(s, OP.PICK_AUGMENT, 0);
    expect(s.lives).toBe(1);
  });

  it('판매: 준비 단계 100% · 전투 중 지은 타워 70% · 재활용 100% · 판매 불가(R8) 거부', () => {
    const s = arena();
    build(s, 0, TOWER_ID.ARCHER);
    expect(sellRefund(s, 0)).toBe(70);
    applyCommand(s, OP.CALL_WAVE);
    build(s, 1, TOWER_ID.ARCHER);
    expect(sellRefund(s, 1)).toBe(49);
    s.effects.push(...AUGMENTS[19].effects);
    expect(sellRefund(s, 1)).toBe(70);
    s.effects.push(...ruleEffects(RULE_ID.NO_SELL, -1));
    expect(sellRefund(s, 1)).toBe(0);
    expect(applyCommand(s, OP.SELL, 1)).toBe(false);
  });

  it('건설 지연: 첫 공격까지 Lv1 1주기 · 업그레이드로 주기가 길어지면 차이만큼 더 기다린다 (판매→다른 슬롯 재건설로 쿨다운을 지우지 못한다)', () => {
    const s = arena();
    expect(applyCommand(s, OP.BUILD, 0, TOWER_ID.CANNON)).toBe(true);
    expect(s.towers[0].cooldown).toBe(45);
    for (const op of [OP.UPGRADE, OP.UPGRADE]) applyCommand(s, op, 0);
    expect(applyCommand(s, OP.BRANCH, 0, 1)).toBe(true); // 공성포 주기 75
    expect(s.towers[0].cooldown).toBe(75);

    // 재활용 + 쏜 직후 판매 → 빈 슬롯에 재건설해도 정상 주기보다 빨리 쏘지 못한다
    const r = arena();
    r.effects.push(...AUGMENTS[19].effects);
    build(r, 0, TOWER_ID.CANNON, 4, 2);
    frozen(r, 2500);
    const events: number[] = [];
    let slot = 0;
    for (let t = 0; t < 300; t++) {
      if (r.towers[0].cooldown === 75 - 1) {
        // 쏜 다음 틱 — 팔고 다른 슬롯(사거리 안)에 다시 짓는다
        applyCommand(r, OP.SELL, slot);
        slot = slot === 0 ? 2 : 0;
        expect(applyCommand(r, OP.BUILD, slot, TOWER_ID.CANNON)).toBe(true);
        for (const op of [OP.UPGRADE, OP.UPGRADE]) applyCommand(r, op, slot);
        applyCommand(r, OP.BRANCH, slot, 1);
      }
      step(r, events);
    }
    expect(eventsOf(events, EVENT.FIRE).length).toBeLessThanOrEqual(Math.ceil(300 / 75));
  });

  it('조기 호출 보너스 = ⌊남은 틱 × 다음 웨이브 클리어 보너스 / 카운트다운⌋ × 효과 · 쉼 없음(R14) 카운트다운 절반', () => {
    const s = arena();
    applyCommand(s, OP.CALL_WAVE);
    while (s.countdown === 0) step(s);
    expect(s.countdownTotal).toBe(600);
    expect(earlyCallBonus(s)).toBe(Math.floor((s.countdown * 24) / 600));
    s.effects.push(...ruleEffects(RULE_ID.HASTE, -1));
    expect(earlyCallBonus(s)).toBe(Math.floor((s.countdown * 24) / 600) * 2);

    const r = createGame({ ...STAGE_E2, rules: [RULE_ID.RELENTLESS] }, 1);
    applyCommand(r, OP.CALL_WAVE);
    while (r.countdown === 0) step(r);
    expect(r.countdownTotal).toBe(300);
  });

  it('wavesStarted: 1웨이브 호출 + 조기 호출 + 카운트다운 자동 시작을 모두 센다', () => {
    const s = arena();
    expect(s.wavesStarted).toBe(0);
    applyCommand(s, OP.CALL_WAVE);
    while (s.countdown === 0) step(s);
    applyCommand(s, OP.CALL_WAVE);
    expect(s.wavesStarted).toBe(2);
    while (s.countdown === 0) step(s);
    while (s.countdown > 0) step(s);
    expect(s.wavesStarted).toBe(3);
  });

  it('강철 군단(R2)·질풍(R1): 그룹 수 ×0.8 · HP ×1.3 · 속도 ×1.2', () => {
    const s = createGame({ ...STAGE_E2, rules: [RULE_ID.STEEL_LEGION, RULE_ID.GALE] }, 1);
    expect(s.waves[0].total).toBe(0); // 시작 전 집계 0
    applyCommand(s, OP.CALL_WAVE);
    expect(s.waves[0].total).toBe(Math.floor((6 * 800) / 1000) + Math.floor((4 * 800) / 1000));
    step(s);
    const g = s.enemies[0];
    expect(g.maxHp).toBe(39);
    expect(enemyStep(g, enemySpeed(s, g.kind))).toBe(Math.floor((33 * 1200) / 1000));
  });

  it('판 도중 붙은 그룹 수 효과도 웨이브 총수와 스폰 수가 같다 — 웨이브가 끝난다', () => {
    const s = arena();
    s.effects.push({ scope: SCOPE.ALL_ENEMIES, target: 0, stat: STAT.ENEMY_COUNT, op: EFFECT_OP.MUL, value: 500 });
    applyCommand(s, OP.CALL_WAVE);
    expect(s.waves[0].total).toBe(Math.floor((6 * 500) / 1000) + Math.floor((4 * 500) / 1000));
    for (let t = 0; t < 3000 && !s.waves[0].cleared; t++) step(s);
    expect(s.waves[0].cleared).toBe(true);
  });

  it('현상금(킬 골드 ×1.2) · 전리품(클리어 보너스 ×1.5)', () => {
    const s = arena();
    s.effects.push(...AUGMENTS[17].effects);
    const g = injectEnemy(s, STAGE_E2, 1000, 100);
    const gold = s.gold;
    s.projectiles.push(testProjectile(s, { targetId: g.id, damage: 1000, damageType: DAMAGE.PURE }));
    step(s);
    expect(s.gold - gold).toBe(Math.floor((g.reward * 1200) / 1000));

    const c = arena();
    c.effects.push(...AUGMENTS[18].effects);
    c.wavesStarted = 1; // 1웨이브를 남은 적 없이 끝난 상태로
    c.waves[0].pending = 0;
    const before = c.gold;
    step(c);
    expect(c.gold - before).toBe(Math.floor((2 * (10 + 1) * 1500) / 1000));
  });
});

// ==================== 증강 제시 (§L10) ====================

describe('증강 제시·선택', () => {
  /** opened = 앞서 연 제시 수 (E2 주기 2 — 전설은 (opened + 1) × 2 ≥ 15, 즉 opened ≥ 7부터) */
  const offer = (setup: (s: GameState) => void, opened = 2, seed = 1): number[] => {
    const s = arena(STAGE_E2, seed);
    setup(s);
    s.offersOpened = opened;
    offerAugments(s, STAGE_E2);
    return s.augmentChoices;
  };

  it('같은 seed·같은 이력 = 같은 후보 · 중복 없음 · 3장', () => {
    for (let seed = 0; seed < 50; seed++) {
      const a = offer(() => {}, 5, seed);
      expect(offer(() => {}, 5, seed)).toEqual(a);
      expect(new Set(a).size).toBe(3);
    }
  });

  it('전설은 정상 순서로 15웨이브 이후에 열렸을 제시부터 — 제시 순번 × 주기 (클리어 순서와 무관)', () => {
    const legendary = (opened: number) =>
      Array.from({ length: 300 }, (_, seed) => offer(() => {}, opened, seed)).some((c) => c.some((id) => AUGMENTS[id].rarity === RARITY.LEGENDARY));
    expect(legendary(6)).toBe(false); // 7번째 제시 = 14웨이브
    expect(legendary(7)).toBe(true); // 8번째 제시 = 16웨이브
  });

  it('보유 카드 제외 · 판매 불가(R8)면 재활용 제외 · 금지 타워가 주 관련 타워인 카드 제외', () => {
    const owned = offer((s) => (s.augments = AUGMENTS.map((c) => c.id).filter((id) => id < 21)));
    expect([...owned].sort()).toEqual([21, 22, 23]);
    for (let seed = 0; seed < 200; seed++) {
      expect(offer((s) => s.effects.push(...ruleEffects(RULE_ID.NO_SELL, -1)), 5, seed)).not.toContain(19);
      const banned = offer((s) => (s.bannedTower = TOWER_ID.TESLA), 9, seed);
      for (const id of [10, 11, 13]) expect(banned).not.toContain(id);
    }
  });

  it('희귀 보장 카운터: 희귀 이상 없는 제시마다 +1, 있으면 0 · 희귀 이상이 남지 않으면 일반으로 채운다', () => {
    const s = arena();
    s.augments = AUGMENTS.filter((c) => c.rarity !== RARITY.COMMON).map((c) => c.id); // 희귀·전설 전부 보유
    for (let i = 1; i <= 4; i++) {
      s.offersOpened = 9;
      offerAugments(s, STAGE_E2);
      expect(s.augmentChoices).toHaveLength(3);
      expect(s.offersWithoutRare).toBe(i);
      s.augmentPending = false;
    }
    s.augments = [];
    s.offersWithoutRare = 3;
    offerAugments(s, STAGE_E2);
    expect(s.offersWithoutRare).toBe(0);
  });

  it('후보는 목숨과 무관 — 같은 seed·같은 선택 이력이면 목숨이 달라도 같은 후보 (누수로 리롤 불가)', () => {
    for (let seed = 0; seed < 100; seed++) {
      expect(offer((s) => (s.lives = 2), 5, seed)).toEqual(offer(() => {}, 5, seed));
    }
  });

  it('희귀 이상이 3회 연속 없으면 다음 제시 첫 장은 희귀 이상', () => {
    for (let seed = 0; seed < 100; seed++) {
      const first = offer((s) => (s.offersWithoutRare = 3), 5, seed)[0];
      expect(AUGMENTS[first].rarity).toBeGreaterThanOrEqual(RARITY.RARE);
    }
  });

  it('보장 규칙(켠 판): 보유 타워 관련 카드 1장 이상 — 끈 판(규칙 아레나)은 보장하지 않는다', () => {
    let unguaranteed = 0;
    for (let seed = 0; seed < 200; seed++) {
      const related = (c: number[]) => c.some((id) => AUGMENTS[id].towers.includes(TOWER_ID.CROSSBOW));
      expect(related(offer((s) => build(s, 0, TOWER_ID.CROSSBOW), 5, seed))).toBe(true);
      const s = createGame(STAGE_E2_RULES, seed);
      build(s, 0, TOWER_ID.CROSSBOW);
      offerAugments(s, STAGE_E2_RULES);
      if (!related(s.augmentChoices)) unguaranteed++;
    }
    expect(unguaranteed).toBeGreaterThan(0);
  });

  it('증강 주기 웨이브 클리어 직후 대기 — 틱 정지·PICK만 수락·효과 추가, 대기 중인 다음 제시는 고른 직후 열린다', () => {
    const s = arena();
    const kinds = [TOWER_ID.ARCHER, TOWER_ID.CANNON, TOWER_ID.MAGE, TOWER_ID.FROST, TOWER_ID.CROSSBOW, TOWER_ID.TESLA];
    for (let slot = 0; slot < 12; slot++) build(s, slot, kinds[slot % 6], 3);
    applyCommand(s, OP.CALL_WAVE);
    for (let t = 0; t < 20000 && !s.augmentPending && !s.over; t++) {
      if (s.countdown > 0) applyCommand(s, OP.CALL_WAVE);
      step(s);
    }
    expect(s.augmentPending).toBe(true);
    expect(s.wavesCleared % STAGE_E2.augmentEvery).toBe(0);
    const tick = s.tick;
    step(s);
    expect(s.tick).toBe(tick);
    expect(applyCommand(s, OP.SET_TARGET, 0, TARGET.LAST)).toBe(false);
    expect(applyCommand(s, OP.PICK_AUGMENT, s.augmentChoices.length)).toBe(false);
    const card = s.augmentChoices[1];
    const effects = s.effects.length;
    expect(applyCommand(s, OP.PICK_AUGMENT, 1)).toBe(true);
    expect([s.augmentPending, s.augments, s.effects.length]).toEqual([false, [card], effects + AUGMENTS[card].effects.length]);

    s.augmentPending = true;
    s.augmentChoices = [0, 2, 4];
    s.augmentQueue = 1;
    expect(applyCommand(s, OP.PICK_AUGMENT, 0)).toBe(true);
    expect([s.augmentPending, s.augmentQueue, s.augmentChoices.length]).toEqual([true, 0, 3]);
  });
});
