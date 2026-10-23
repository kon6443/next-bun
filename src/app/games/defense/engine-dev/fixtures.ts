/**
 * 시험·벤치용 엔티티 주입 — 엔진 생성 함수(createEnemy)를 그대로 써서 필드 누락이 없게 한다
 * 엔진 폴더 밖(매니페스트 대상 아님)
 */

import { type Enemy, type GameState, PROJECTILE_STATUS, type Projectile, type Stage, createEnemy } from '../engine';

/** 경로 위 거리 dist에 적 1마리 — 1웨이브 집계(total·pending)에 더한다 */
export function injectEnemy(state: GameState, stage: Stage, dist: number, hp = 100, kind = 0, path = 0): Enemy {
  const enemy = createEnemy(state, stage, { kind, hp, wave: 1, path, dist, derived: false }, null);
  state.waves[0].total += 1;
  state.waves[0].pending += 1;
  return enemy;
}

/** 날아가는 투사체 (궁수탑 Lv1 기준 기본값) */
export function testProjectile(state: GameState, fields: Partial<Projectile>): Projectile {
  return {
    id: state.nextId++,
    towerId: 0,
    slot: 0,
    towerKind: 0,
    level: 1,
    branch: 0,
    targetId: 0,
    damage: 1,
    damageType: 0,
    element: 0,
    splash: 0,
    nthStatus: false,
    pierce: 0,
    aftershock: false,
    originX: 0,
    originY: 0,
    aimX: 0,
    aimY: 0,
    ticksLeft: 1,
    totalTicks: 1,
    status: PROJECTILE_STATUS.FLYING,
    targetHint: 0,
    ...fields,
  };
}
