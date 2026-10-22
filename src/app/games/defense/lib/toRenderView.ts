import { ENEMIES, ENEMY_STATUS, PROJECTILE_STATUS, RANK, type GameState, type Stage, statusBits, ultimatePeriod } from '../engine';
import type { RenderEnemy, RenderMap, RenderProjectile, RenderTower, RenderView } from '../renderer/renderView';

/**
 * 엔진 상태 → 렌더 상태 어댑터 (엔진 버전 2) — 엔진 폴더는 외부 import가 금지라 엔진 밖에 둔다
 * 매 프레임 부르므로 view의 배열·객체를 재사용한다(프레임당 할당 0 목표 — 개수가 늘 때만 새 객체)
 * 구버전 엔진을 동결하면(engine-versions/vN) 그 버전용 어댑터를 옆에 함께 둔다
 * 보간: view 객체를 그대로 재사용하므로 이전 틱 위치가 필요하면 호출자가 view 두 개를 번갈아 넘기거나 id별 이전 좌표를 따로 둔다
 */
export function toRenderView(state: GameState, view: RenderView): RenderView {
  view.tick = state.tick;
  view.bossPhase = 0;

  let n = 0;
  for (const enemy of state.enemies) {
    if (enemy.status !== ENEMY_STATUS.ALIVE) continue;
    const item: RenderEnemy = view.enemies[n] ?? (view.enemies[n] = { id: 0, kind: 0, x: 0, y: 0, hp: 0, maxHp: 0, effects: 0, air: false });
    item.id = enemy.id;
    item.kind = enemy.kind;
    item.x = enemy.x;
    item.y = enemy.y;
    item.hp = enemy.hp;
    item.maxHp = enemy.maxHp;
    item.effects = statusBits(enemy);
    item.air = enemy.air;
    // 보스 페이즈 — 먼저 나온(생성 순번 작은) 보스 기준 1·2
    if (view.bossPhase === 0 && ENEMIES[enemy.kind].rank === RANK.BOSS) view.bossPhase = enemy.phase + 1;
    n++;
  }
  view.enemies.length = n;

  n = 0;
  for (const tower of state.towers) {
    const item: RenderTower =
      view.towers[n] ?? (view.towers[n] = { id: 0, slot: 0, kind: 0, level: 0, branch: 0, x: 0, y: 0, targetId: 0, ultCooldown: 0 });
    item.id = tower.id;
    item.slot = tower.slot;
    item.kind = tower.kind;
    item.level = tower.level;
    item.branch = tower.branch;
    item.x = tower.x;
    item.y = tower.y;
    item.targetId = tower.targetId;
    item.ultCooldown = ultCooldownPermille(tower.kind, tower.level, tower.branch, tower.ultTimer);
    n++;
  }
  view.towers.length = n;

  n = 0;
  for (const projectile of state.projectiles) {
    if (projectile.status !== PROJECTILE_STATUS.FLYING) continue;
    const item: RenderProjectile = view.projectiles[n] ?? (view.projectiles[n] = { id: 0, x: 0, y: 0, element: 0, damageType: 0 });
    // 비행 시간만 있는 유도형 — 발사 지점에서 표적의 마지막 위치까지 지난 비율만큼
    const t = (projectile.totalTicks - projectile.ticksLeft) / projectile.totalTicks;
    item.id = projectile.id;
    item.x = projectile.originX + (projectile.aimX - projectile.originX) * t;
    item.y = projectile.originY + (projectile.aimY - projectile.originY) * t;
    item.element = projectile.element;
    item.damageType = projectile.damageType;
    n++;
  }
  view.projectiles.length = n;
  return view;
}

/** 궁극 쿨다운 남은 비율 ‰ — 궁극이 없거나 준비됐으면 0 */
function ultCooldownPermille(kind: number, level: number, branch: number, ultTimer: number): number {
  const every = ultimatePeriod(kind, level, branch);
  return every > 0 && ultTimer > 0 ? Math.floor((ultTimer * 1000) / every) : 0;
}

/** 스테이지 맵 → 정적 렌더 맵 */
export function toRenderMap(stage: Stage): RenderMap {
  const { map } = stage;
  return {
    width: map.width,
    height: map.height,
    groundPaths: map.groundPaths.map((p) => p.points),
    airPaths: map.airPaths.map((p) => p.points),
    slots: map.slots,
  };
}
