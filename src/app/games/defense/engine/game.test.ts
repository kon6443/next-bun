import { describe, it, expect } from 'vitest';
import {
  EVENT,
  EVENT_STRIDE,
  MAX_ALIVE_ENEMIES,
  MAX_PROJECTILES,
  OP,
  TARGET,
  WAVE_COUNTDOWN_TICKS,
} from './constants';
import { STAGE_E1 } from './data/stages';
import {
  ENEMY_STATUS,
  type Enemy,
  type GameState,
  applyCommand,
  createGame,
  earlyCallBonus,
  getStateHash,
  scoreOf,
  sellRefund,
  step,
  upgradeCost,
  waveClearBonus,
} from './game';

const ARCHER = 0;

const newGame = (seed = 1) => createGame(STAGE_E1, seed);

function run(state: GameState, ticks: number): void {
  for (let i = 0; i < ticks && !state.over; i++) step(state);
}

/** 시험용 적 — 경로 위 거리 dist에 직접 둔다 */
function injectEnemy(state: GameState, dist: number, hp = 100): Enemy {
  const enemy: Enemy = {
    id: state.nextId++,
    kind: 0,
    hp,
    maxHp: hp,
    path: 0,
    dist,
    segment: 0,
    segmentStart: 0,
    x: 0,
    y: 0,
    wave: 1,
    reward: 1,
    status: ENEMY_STATUS.ALIVE,
  };
  // 위치 계산은 step 4단계와 같게: 한 틱 이동 전 자리로 놓고 거리 0만큼 진행
  const path = STAGE_E1.map.groundPaths[0];
  let start = 0;
  let seg = 0;
  while (seg < path.segmentLengths.length - 1 && dist - start >= path.segmentLengths[seg]) start += path.segmentLengths[seg++];
  const d = dist - start;
  const len = path.segmentLengths[seg];
  const [x0, y0, x1, y1] = path.points.slice(seg * 2, seg * 2 + 4);
  enemy.segment = seg;
  enemy.segmentStart = start;
  enemy.x = x0 + Math.trunc(((x1 - x0) * d) / len);
  enemy.y = y0 + Math.trunc(((y1 - y0) * d) / len);
  state.enemies.push(enemy);
  state.aliveEnemies += 1;
  state.waves[0].total += 1;
  state.waves[0].pending += 1;
  return enemy;
}

/** 궁수탑 Lv3 4개로 1웨이브를 막고, 적이 모두 사라진 카운트다운 중으로 — 준비 단계 */
function strongDefense(): GameState {
  const s = newGame();
  s.gold = 2000;
  for (const slot of [0, 1, 2, 3]) {
    applyCommand(s, OP.BUILD, slot, ARCHER);
    applyCommand(s, OP.UPGRADE, slot);
    applyCommand(s, OP.UPGRADE, slot);
  }
  applyCommand(s, OP.CALL_WAVE);
  for (let i = 0; i < 3000 && !(s.countdown > 0 && s.aliveEnemies === 0); i++) step(s);
  return s;
}

describe('명령 수락 규칙 (§E3)', () => {
  it('BUILD: 빈 슬롯·쓸 수 있는 타워·골드 충분할 때만, 지으면 골드 차감', () => {
    const s = newGame();
    expect(applyCommand(s, OP.BUILD, 0, ARCHER)).toBe(true);
    expect(s.gold).toBe(220 - 70);
    expect(applyCommand(s, OP.BUILD, 0, ARCHER)).toBe(false); // 이미 있음
    expect(applyCommand(s, OP.BUILD, 8, ARCHER)).toBe(false); // 슬롯 없음 (맵 슬롯 8개)
    expect(applyCommand(s, OP.BUILD, 1, 1)).toBe(false); // 없는 타워
    expect(applyCommand(s, OP.BUILD, 1, ARCHER)).toBe(true);
    expect(applyCommand(s, OP.BUILD, 2, ARCHER)).toBe(true);
    expect(s.gold).toBe(10);
    expect(applyCommand(s, OP.BUILD, 3, ARCHER)).toBe(false); // 골드 부족
  });

  it('UPGRADE: Lv1→2(50)→3(80), 스테이지 상한 Lv3에서 거부', () => {
    const s = newGame();
    s.gold = 1000;
    applyCommand(s, OP.BUILD, 0, ARCHER);
    expect(upgradeCost(s, 0)).toBe(50);
    expect(applyCommand(s, OP.UPGRADE, 0)).toBe(true);
    expect(upgradeCost(s, 0)).toBe(80);
    expect(applyCommand(s, OP.UPGRADE, 0)).toBe(true);
    expect(s.towers[0].level).toBe(3);
    expect(upgradeCost(s, 0)).toBe(0);
    expect(applyCommand(s, OP.UPGRADE, 0)).toBe(false);
    expect(applyCommand(s, OP.UPGRADE, 1)).toBe(false); // 빈 슬롯
    expect(s.gold).toBe(1000 - 70 - 50 - 80);
    expect(s.towers[0].invested).toBe(200);
  });

  it('SET_TARGET: 0~3만, 타워가 있어야', () => {
    const s = newGame();
    applyCommand(s, OP.BUILD, 0, ARCHER);
    expect(applyCommand(s, OP.SET_TARGET, 0, TARGET.NEAREST)).toBe(true);
    expect(s.towers[0].targetMode).toBe(TARGET.NEAREST);
    expect(applyCommand(s, OP.SET_TARGET, 0, 4)).toBe(false);
    expect(applyCommand(s, OP.SET_TARGET, 1, 0)).toBe(false);
  });

  it('BRANCH·PICK_AUGMENT는 E1 데이터에서 항상 거부', () => {
    const s = newGame();
    s.gold = 1000;
    applyCommand(s, OP.BUILD, 0, ARCHER);
    applyCommand(s, OP.UPGRADE, 0);
    applyCommand(s, OP.UPGRADE, 0);
    expect(applyCommand(s, OP.BRANCH, 0, 0)).toBe(false);
    expect(applyCommand(s, OP.PICK_AUGMENT, 0)).toBe(false);
  });

  it('증강 대기 중에는 모든 명령 거부(E1은 PICK도 데이터가 없어 거부), 틱도 진행하지 않는다', () => {
    const s = newGame();
    s.augmentPending = true;
    expect(applyCommand(s, OP.BUILD, 0, ARCHER)).toBe(false);
    expect(applyCommand(s, OP.CALL_WAVE)).toBe(false);
    step(s);
    expect(s.tick).toBe(0);
  });

  it('끝난 판은 모든 명령을 거부', () => {
    const s = newGame();
    s.over = true;
    expect(applyCommand(s, OP.BUILD, 0, ARCHER)).toBe(false);
  });

  it('일시정지 중(틱 진행 없음) 같은 틱에 명령 여러 개 — 순서대로 즉시 반영', () => {
    const s = newGame();
    expect(applyCommand(s, OP.BUILD, 0, ARCHER)).toBe(true);
    expect(applyCommand(s, OP.SELL, 0)).toBe(true);
    expect(applyCommand(s, OP.BUILD, 0, ARCHER)).toBe(true);
    expect(s.tick).toBe(0);
    expect(s.gold).toBe(150);
  });
});

describe('웨이브 호출·카운트다운·조기 호출 (§L4)', () => {
  it('1웨이브는 호출해야 시작, 스폰 중 재호출은 거부, 스폰이 끝나면 600틱 카운트다운 후 자동 시작', () => {
    const s = newGame();
    run(s, 50);
    expect(s.wavesStarted).toBe(0);
    expect(applyCommand(s, OP.CALL_WAVE)).toBe(true);
    expect(applyCommand(s, OP.CALL_WAVE)).toBe(false);
    // 1웨이브 15마리 × 24틱 간격 — 마지막 스폰은 시작 후 14×24틱
    run(s, 14 * 24 + 1);
    expect(s.spawners).toHaveLength(0);
    expect(s.countdown).toBe(WAVE_COUNTDOWN_TICKS);
    run(s, WAVE_COUNTDOWN_TICKS - 1);
    expect(s.wavesStarted).toBe(1);
    run(s, 1);
    expect(s.wavesStarted).toBe(2);
  });

  it('조기 호출 보너스 = ⌊남은 틱 × 다음 웨이브 클리어 보너스 / 600⌋ — 받고 곧바로 시작', () => {
    const s = newGame();
    applyCommand(s, OP.CALL_WAVE);
    run(s, 14 * 24 + 1 + 100); // 카운트다운 500 남음
    expect(s.countdown).toBe(500);
    expect(earlyCallBonus(s)).toBe(Math.floor((500 * waveClearBonus(2)) / 600));
    const gold = s.gold;
    const earned = s.goldEarned;
    const bonus = earlyCallBonus(s);
    expect(applyCommand(s, OP.CALL_WAVE)).toBe(true);
    expect(s.gold).toBe(gold + bonus);
    expect(s.goldEarned).toBe(earned + bonus);
    expect(s.wavesStarted).toBe(2);
    expect(s.countdown).toBe(0);
    expect(earlyCallBonus(s)).toBe(0);
  });

  it('클리어 보너스 2(10+n)는 웨이브마다 한 번 — 전부 샌 웨이브도 끝난 웨이브로 센다', () => {
    const s = newGame();
    const events: number[] = [];
    applyCommand(s, OP.CALL_WAVE, 0, 0, events);
    for (let i = 0; i < 2000 && s.wavesCleared === 0; i++) step(s, events);
    expect(s.wavesCleared).toBe(1);
    const clears = [];
    for (let i = 0; i < events.length; i += EVENT_STRIDE) if (events[i] === EVENT.WAVE_CLEAR) clears.push([events[i + 1], events[i + 2]]);
    expect(clears).toEqual([[1, waveClearBonus(1)]]);
    expect(s.lives).toBe(20 - 15);
  });
});

describe('판매 환급 (§L4)', () => {
  it('같은 준비 단계(지은 뒤 웨이브 시작 전)는 100%, 웨이브가 시작된 뒤는 70% 내림', () => {
    const s = newGame();
    s.gold = 1000;
    applyCommand(s, OP.BUILD, 0, ARCHER);
    applyCommand(s, OP.UPGRADE, 0);
    expect(sellRefund(s, 0)).toBe(120);
    applyCommand(s, OP.CALL_WAVE);
    expect(sellRefund(s, 0)).toBe(84);
    const gold = s.gold;
    expect(applyCommand(s, OP.SELL, 0)).toBe(true);
    expect(s.gold).toBe(gold + 84);
    expect(s.towers).toHaveLength(0);
    expect(sellRefund(s, 0)).toBe(0);
    expect(applyCommand(s, OP.SELL, 0)).toBe(false);
  });

  it('웨이브 사이 준비 단계(적이 없는 카운트다운)에 지은 타워는 그 단계 안에서 100%, 다음 웨이브가 시작되면 70%', () => {
    const s = strongDefense();
    expect(s.countdown).toBeGreaterThan(0);
    expect(s.aliveEnemies).toBe(0);
    applyCommand(s, OP.BUILD, 7, ARCHER);
    expect(sellRefund(s, 7)).toBe(70);
    applyCommand(s, OP.CALL_WAVE);
    expect(sellRefund(s, 7)).toBe(49);
  });
});

describe('타게팅 (§C2)', () => {
  /** 슬롯 3(4500, 6500) 궁수탑 사거리 3000 — 구간 1(y=4500)·2(x=7500)·3(y=9500) 일부가 안에 든다 */
  function setup(mode: number) {
    const s = newGame();
    applyCommand(s, OP.BUILD, 3, ARCHER);
    applyCommand(s, OP.SET_TARGET, 3, mode);
    return s;
  }

  it('선두 = 가장 많이 간 적, 후미 = 가장 덜 간 적, 최강 = HP 최대, 최근접 = 거리 최소', () => {
    const cases: [number, (e: Enemy[]) => Enemy][] = [
      [TARGET.FIRST, (e) => e[2]],
      [TARGET.LAST, (e) => e[0]],
      [TARGET.STRONGEST, (e) => e[1]],
      [TARGET.NEAREST, (e) => e[1]],
    ];
    for (const [mode, expected] of cases) {
      const s = setup(mode);
      // 경로 거리 6000 → (3000,4500) 탑에서 2500 · 7000 → (4000,4500) 2062 · 8500 → (5500,4500) 2236 — 모두 사거리 3000 안
      const enemies = [injectEnemy(s, 6000, 50), injectEnemy(s, 7000, 90), injectEnemy(s, 8500, 60)];
      for (const e of enemies) e.dist -= 33; // step 4단계 이동을 상쇄
      step(s);
      expect(s.towers[0].targetId).toBe(expected(enemies).id);
    }
  });

  it('동률: 경로 진행 거리 큰 순 → 생성 순번 작은 순', () => {
    const s = setup(TARGET.STRONGEST);
    const a = injectEnemy(s, 6000, 80);
    const b = injectEnemy(s, 7000, 80);
    a.dist -= 33;
    b.dist -= 33;
    step(s);
    expect(s.towers[0].targetId).toBe(b.id);
    const t = setup(TARGET.FIRST);
    const c = injectEnemy(t, 6500, 10);
    const d = injectEnemy(t, 6500, 10);
    step(t);
    expect(t.towers[0].targetId).toBe(c.id);
    expect(d.id).toBeGreaterThan(c.id);
  });
});

describe('전투·경제 (§C1·§L4)', () => {
  it('유도 투사체: 비행 틱 후 명중, 피해 = 기본 피해(저항 0) — 처치 시 보상 max(1, ⌊EHP×110×1000/10⁶⌋)', () => {
    const s = newGame();
    applyCommand(s, OP.BUILD, 3, ARCHER);
    const enemy = injectEnemy(s, 6000, 8);
    enemy.dist -= 33;
    enemy.reward = Math.max(1, Math.floor((8 * 110 * 1000) / 1000000));
    const events: number[] = [];
    const gold = s.gold;
    for (let i = 0; i < 30 && s.kills === 0; i++) step(s, events);
    expect(s.kills).toBe(1);
    expect(s.gold).toBe(gold + 1);
    const kinds = [];
    for (let i = 0; i < events.length; i += EVENT_STRIDE) kinds.push(events[i]);
    expect(kinds).toEqual([EVENT.FIRE, EVENT.HIT, EVENT.DEATH]);
    expect(events[EVENT_STRIDE + 2]).toBe(8); // HIT 피해
  });

  it('표적이 먼저 죽으면 단일 투사체는 사라진다(피해 없음)', () => {
    const s = newGame();
    s.gold = 1000;
    applyCommand(s, OP.BUILD, 3, ARCHER);
    applyCommand(s, OP.BUILD, 2, ARCHER);
    const enemy = injectEnemy(s, 6000, 5);
    enemy.dist -= 33;
    step(s); // 두 탑이 같은 적에게 발사
    expect(s.projectiles).toHaveLength(2);
    for (let i = 0; i < 30; i++) step(s);
    expect(s.kills).toBe(1);
    expect(s.projectiles).toHaveLength(0);
  });

  it('누수: 경로 끝에 닿으면 목숨 −1, 목숨 0이면 패배로 끝', () => {
    const s = newGame();
    s.lives = 1;
    injectEnemy(s, 30000 - 33);
    step(s);
    expect(s.lives).toBe(0);
    expect(s.over).toBe(true);
    expect(s.victory).toBe(false);
    expect(s.endTick).toBe(1);
  });
});

describe('상한 (§E5)', () => {
  it(`살아 있는 적 ${MAX_ALIVE_ENEMIES}이면 스폰을 다음 틱으로 미룬다`, () => {
    const s = newGame();
    s.lives = 1000;
    for (let i = 0; i < MAX_ALIVE_ENEMIES; i++) injectEnemy(s, 0);
    applyCommand(s, OP.CALL_WAVE);
    step(s);
    expect(s.spawners[0].remaining).toBe(15);
    expect(s.spawners[0].next).toBe(0);
    s.enemies[0].status = ENEMY_STATUS.KILLED; // 한 자리 빈다
    s.aliveEnemies -= 1;
    step(s);
    expect(s.spawners[0].remaining).toBe(14);
  });

  it(`날아가는 투사체 ${MAX_PROJECTILES}이면 발사를 보류 — 쿨다운 0 유지, 표적도 다시 고르지 않는다(포신은 직전 표적)`, () => {
    const s = newGame();
    applyCommand(s, OP.BUILD, 3, ARCHER);
    const enemy = injectEnemy(s, 6000, 1000000);
    enemy.dist -= 33;
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      s.projectiles.push({
        id: s.nextId++, towerId: 0, targetId: enemy.id, damage: 1, damageType: 0, element: 0,
        originX: 0, originY: 0, aimX: 0, aimY: 0, ticksLeft: 1000, totalTicks: 1000, status: 0, targetHint: 0,
      });
    }
    s.towers[0].targetId = 777; // 직전 표적
    step(s);
    expect(s.towers[0].cooldown).toBe(0);
    expect(s.towers[0].targetId).toBe(777);
    expect(s.projectiles).toHaveLength(MAX_PROJECTILES);
    // 자리가 나면 다음 틱에 바로 고르고 쏜다
    s.projectiles.pop();
    step(s);
    expect(s.towers[0].targetId).toBe(enemy.id);
    expect(s.towers[0].cooldown).toBe(18);
  });
});

describe('결정성 (§E7)', () => {
  it('같은 seed·같은 명령이면 상태 해시가 같고, seed가 다르면 다르다(스트림 시드가 상태에 있다)', () => {
    const play = (seed: number) => {
      const s = createGame(STAGE_E1, seed);
      applyCommand(s, OP.BUILD, 0, ARCHER);
      applyCommand(s, OP.CALL_WAVE);
      run(s, 5000);
      return getStateHash(s);
    };
    expect(play(42)).toBe(play(42));
    expect(play(42)).not.toBe(play(43));
  });

  it('PRNG 스트림 3개는 서로 다른 시드', () => {
    const s = newGame(7);
    expect(new Set([s.rngWave, s.rngAugment, s.rngCombat]).size).toBe(3);
    for (const v of [s.rngWave, s.rngAugment, s.rngCombat]) {
      expect(Number.isInteger(v) && v >= 0 && v < 2 ** 32).toBe(true);
    }
  });

  it('events 버퍼 유무는 결과에 영향 없다', () => {
    const a = newGame(3);
    const b = newGame(3);
    const events: number[] = [];
    for (const s of [a, b]) {
      applyCommand(s, OP.BUILD, 0, ARCHER);
      applyCommand(s, OP.CALL_WAVE);
    }
    for (let i = 0; i < 3000; i++) {
      step(a);
      events.length = 0;
      step(b, events);
    }
    expect(getStateHash(a)).toBe(getStateHash(b));
  });
});

describe('투사체 표적 조회 캐시', () => {
  it('힌트가 틀려도(외부에서 만든 상태·복제) 표적을 찾는다 — 캐시는 결과에 영향 없다', () => {
    const s = newGame();
    const a = injectEnemy(s, 100, 1000);
    const b = injectEnemy(s, 200, 1000);
    for (const hint of [0, 1, 5, 99]) {
      s.projectiles.push({
        id: s.nextId++, towerId: 0, targetId: b.id, damage: 1, damageType: 0, element: 0,
        originX: 0, originY: 0, aimX: 0, aimY: 0, ticksLeft: 1, totalTicks: 1, status: 0, targetHint: hint,
      });
    }
    step(s);
    expect(b.hp).toBe(1000 - 4);
    expect(a.hp).toBe(1000);
  });
});

describe('리뷰 보강 — 경계 규칙', () => {
  it('판매 100%는 준비 단계(1웨이브 전·카운트다운 중)에 지은 타워만 — 웨이브 전투 중 지은 타워는 카운트다운이 와도 70%', () => {
    const s = newGame();
    applyCommand(s, OP.CALL_WAVE);
    run(s, 50); // 1웨이브 스폰 중
    expect(s.countdown).toBe(0);
    applyCommand(s, OP.BUILD, 3, ARCHER);
    expect(sellRefund(s, 3)).toBe(49);
    run(s, 14 * 24); // 스폰이 끝나 카운트다운
    expect(s.countdown).toBeGreaterThan(0);
    expect(sellRefund(s, 3)).toBe(49);
  });

  it('카운트다운 중이어도 직전 웨이브 적이 남아 있으면 준비 단계가 아니다 — 그때 지은 타워는 70%', () => {
    const s = newGame();
    s.gold = 2000;
    for (const slot of [0, 1, 2, 3]) {
      applyCommand(s, OP.BUILD, slot, ARCHER);
      applyCommand(s, OP.UPGRADE, slot);
      applyCommand(s, OP.UPGRADE, slot);
    }
    applyCommand(s, OP.CALL_WAVE);
    for (let i = 0; i < 2000 && s.countdown === 0; i++) step(s); // 스폰이 끝난 첫 틱 — 마지막 적이 막 나왔다
    expect(s.countdown).toBeGreaterThan(0);
    expect(s.aliveEnemies).toBeGreaterThan(0);
    applyCommand(s, OP.BUILD, 6, ARCHER);
    expect(sellRefund(s, 6)).toBe(49);
  });

  it('그룹 지연 d틱이면 웨이브 시작 d틱 뒤 첫 스폰 (0과 1이 같은 틱이 아니다)', () => {
    for (const delay of [0, 1, 5]) {
      const s = newGame();
      applyCommand(s, OP.CALL_WAVE);
      s.spawners[0].next = delay; // 같은 그룹을 지연만 바꿔 시험
      let firstSpawnTick = -1;
      for (let t = 0; t < 10 && firstSpawnTick < 0; t++) {
        step(s);
        if (s.enemies.length > 0) firstSpawnTick = s.tick - 1;
      }
      expect(firstSpawnTick).toBe(delay);
    }
  });

  it('비행 N틱 투사체는 발사 N틱 뒤 틱에 명중한다 (발사 틱에는 날지 않는다)', () => {
    const s = newGame();
    applyCommand(s, OP.BUILD, 3, ARCHER);
    const enemy = injectEnemy(s, 6000, 1000);
    enemy.dist -= 33;
    const events: number[] = [];
    step(s, events);
    const fireTick = s.tick - 1;
    const flight = s.projectiles[0].totalTicks;
    expect(s.projectiles[0].ticksLeft).toBe(flight);
    let hitTick = -1;
    for (let i = 0; i < 40 && hitTick < 0; i++) {
      events.length = 0;
      step(s, events);
      for (let k = 0; k < events.length; k += EVENT_STRIDE) if (events[k] === EVENT.HIT) hitTick = s.tick - 1;
    }
    expect(hitTick - fireTick).toBe(flight);
  });

  it('목숨이 0이 되는 틱에 마지막 웨이브가 끝나도 패배', () => {
    const s = newGame();
    s.lives = 1;
    s.wavesStarted = STAGE_E1.waves.length;
    for (let i = 0; i < s.waves.length - 1; i++) {
      s.waves[i].cleared = true;
      s.waves[i].pending = 0;
    }
    s.wavesCleared = s.waves.length - 1;
    const last = s.waves[s.waves.length - 1];
    last.total = 1;
    last.pending = 0;
    const e = injectEnemy(s, 30000 - 33);
    e.wave = s.waves.length;
    s.waves[0].pending -= 1;
    s.waves[0].total -= 1;
    last.pending = 1;
    step(s);
    expect(s.lives).toBe(0);
    expect(s.wavesCleared).toBe(s.waves.length);
    expect(s.over).toBe(true);
    expect(s.victory).toBe(false);
  });

  it('점수 = 클리어 웨이브 × 10⁶ + 첫 미클리어 웨이브 처치 진척‰ × 10³', () => {
    const s = newGame();
    s.wavesStarted = 2;
    s.wavesCleared = 1;
    s.waves[0].cleared = true;
    s.waves[1].kills = 7; // 18마리 중 7 — 388‰
    expect(scoreOf(s)).toEqual({ score: 1_388_000, wave: 1, progress: 388 });
    s.waves[1].total = 0; // 방어: 빈 웨이브는 0으로 나누지 않는다
    expect(scoreOf(s).progress).toBe(0);
  });
});
