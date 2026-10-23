import { EVENT, EVENT_STRIDE, STATUS } from '../engine';
import { SOUND } from '../audio/sfx';
import { BOSS_KINDS } from '../renderer/palette';
import type { DamageNumberPool, EffectPool, ParticlePool } from '../renderer/particles';
import type { RenderView } from '../renderer/renderView';

/**
 * 틱 렌더 이벤트 → 연출·효과음 (defense DESIGN §F8·§F9) — 판 상태에는 영향이 없다(렌더 이벤트는 해시 밖)
 * 명중 파티클 색 = 투사체 원소(없으면 불꽃), 상태효과 = 화상 불씨·독 거품·얼음 결정·기절 번개, 펄스 = 충격파 고리, 연쇄 = 번개 선
 * 목록은 모두 id 오름차순(엔진 생성 순번) — 이분 탐색
 */

/** 파티클 색 인덱스 (renderer PARTICLE_COLORS: 0 불꽃, 1~4 원소) */
const SPARK = 0;
/** 한 틱에 새로 만드는 파티클 상한 — 범위 명중이 몰려도 풀을 한 틱에 덮어쓰지 않게 */
export const PARTICLES_PER_TICK = 30;
/** 상태효과 → 파티클 색(원소) — 감속 = 얼음, 화상 = 불, 독 = 독, 기절 = 번개 */
const STATUS_COLOR: Partial<Record<number, number>> = { [STATUS.SLOW]: 2, [STATUS.BURN]: 1, [STATUS.POISON]: 4, [STATUS.STUN]: 3 };
/** 타워 종류 → 발사음 */
const FIRE_SOUND: readonly number[] = [SOUND.FIRE_ARCHER, SOUND.FIRE_CANNON, SOUND.FIRE_MAGE, SOUND.FIRE_FROST, SOUND.FIRE_CROSSBOW, SOUND.FIRE_TESLA];

export function findById<T extends { id: number }>(list: readonly T[], id: number): T | null {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const value = list[mid].id;
    if (value === id) return list[mid];
    if (value < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

export type FxPools = { particles: ParticlePool; numbers: DamageNumberPool; effects: EffectPool };

/** 이번 틱에 남은 파티클 수 — 틱마다 클로저를 만들지 않게 모듈 상태(한 번에 한 판만 그린다) */
let budget = 0;

function spray(particles: ParticlePool, x: number, y: number, n: number, speed: number, life: number, color: number): void {
  for (let k = 0; k < n && budget > 0; k++, budget--) particles.spawn(x, y, (Math.random() - 0.5) * speed, (Math.random() - 0.5) * speed, life, color);
}

/** 이번 틱 위치, 없으면(이번 틱에 빠진 적) 직전 틱 위치 */
function enemyAt(view: RenderView, prev: RenderView, id: number) {
  return findById(view.enemies, id) ?? findById(prev.enemies, id);
}

export type TickNotice = {
  /** 이번 틱에 샌 목숨 (0 = 없음) — 누수 맥동·진동·흔들림 */
  leakedLives: number;
  /** 이번 틱에 나온 보스 종류 (−1 = 없음) — 등장 배너·흔들림 */
  bossSpawned: number;
  /** 낼 효과음 (중복 포함 — 솎기는 Sfx가 한다) */
  sounds: number[];
};

export function createTickNotice(): TickNotice {
  return { leakedLives: 0, bossSpawned: -1, sounds: [] };
}

/** 이벤트를 연출 풀에 옮기고, 화면·소리가 반응할 일을 notice에 담는다(notice는 호출자가 재사용) */
export function applyTickEvents(events: readonly number[], view: RenderView, prev: RenderView, pools: FxPools, notice: TickNotice, showNumbers: boolean): TickNotice {
  notice.leakedLives = 0;
  notice.bossSpawned = -1;
  notice.sounds.length = 0;
  budget = PARTICLES_PER_TICK;
  const { particles } = pools;
  for (let i = 0; i < events.length; i += EVENT_STRIDE) {
    const type = events[i];
    const a = events[i + 1];
    const b = events[i + 2];
    const c = events[i + 3];
    if (type === EVENT.HIT) {
      // 마지막 일격은 이번 틱에 빠졌다 — 직전 틱 위치로
      const enemy = enemyAt(view, prev, a);
      if (!enemy) continue;
      const projectile = findById(prev.projectiles, c);
      spray(particles, enemy.x, enemy.y, 3, 2400, 350, projectile && projectile.element > 0 ? projectile.element : SPARK);
      if (showNumbers) pools.numbers.spawnNumber(enemy.x, enemy.y, b, 700);
      notice.sounds.push(SOUND.HIT);
    } else if (type === EVENT.DEATH) {
      spray(particles, b, c, 6, 3200, 500, SPARK);
      notice.sounds.push(SOUND.DEATH);
    } else if (type === EVENT.STATUS) {
      const color = STATUS_COLOR[b];
      const enemy = color === undefined ? null : enemyAt(view, prev, a);
      if (enemy && color !== undefined) spray(particles, enemy.x, enemy.y, 2, 900, 600, color);
    } else if (type === EVENT.PULSE) {
      const tower = findById(view.towers, a);
      if (tower) pools.effects.ring(tower.x, tower.y, Math.max(600, b), 380);
      notice.sounds.push(SOUND.EXPLODE);
    } else if (type === EVENT.CHAIN) {
      const from = enemyAt(view, prev, a);
      const to = enemyAt(view, prev, b);
      if (from && to) pools.effects.bolt(from.x, from.y, to.x, to.y, 160);
    } else if (type === EVENT.FIRE) {
      const tower = findById(view.towers, a);
      if (tower) notice.sounds.push(FIRE_SOUND[tower.kind] ?? SOUND.FIRE_ARCHER);
    } else if (type === EVENT.LEAK) {
      notice.leakedLives += b;
      notice.sounds.push(SOUND.LEAK);
    } else if (type === EVENT.WAVE_START) {
      notice.sounds.push(SOUND.WAVE_START);
    } else if (type === EVENT.SPAWN && BOSS_KINDS.indexOf(b) >= 0) {
      notice.bossSpawned = b;
      notice.sounds.push(SOUND.BOSS);
    }
  }
  return notice;
}
