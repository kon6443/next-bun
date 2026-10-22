import { describe, it, expect } from 'vitest';
import { OP, STAGE_E1, TOWERS, applyCommand, createGame, findStage, step, ultimatePeriod } from '../engine';
import { testProjectile } from '../engine-dev/fixtures';
import { createRenderView } from '../renderer/renderView';
import { toRenderMap, toRenderView } from './toRenderView';

describe('toRenderView — 엔진 상태를 렌더 상태로', () => {
  it('살아 있는 적·타워·날아가는 투사체만, 객체를 재사용한다', () => {
    const state = createGame(STAGE_E1, 1);
    applyCommand(state, OP.BUILD, 0, 0);
    applyCommand(state, OP.CALL_WAVE);
    const view = createRenderView();
    let sawProjectile = false;
    let reused = 0;
    let previous = view.enemies[0];
    for (let i = 0; i < 600; i++) {
      step(state);
      toRenderView(state, view);
      expect(view.tick).toBe(state.tick);
      expect(view.enemies.length).toBe(state.enemies.filter((e) => e.status === 0).length);
      expect(view.towers.map((t) => t.slot)).toEqual([0]);
      if (view.projectiles.length > 0) sawProjectile = true;
      if (previous && view.enemies[0] === previous) reused++;
      previous = view.enemies[0];
    }
    expect(sawProjectile).toBe(true);
    expect(reused).toBeGreaterThan(100);
    const e = state.enemies.find((x) => x.status === 0);
    if (e) expect(view.enemies.find((x) => x.id === e.id)).toMatchObject({ x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, air: false, effects: 0 });
  });

  it('투사체 위치는 발사 지점 → 표적 마지막 위치 사이 비율', () => {
    const state = createGame(STAGE_E1, 1);
    state.projectiles.push(testProjectile(state, { id: 9, towerId: 1, targetId: 2, aimX: 1000, aimY: 2000, ticksLeft: 3, totalTicks: 4 }));
    const view = toRenderView(state, createRenderView());
    expect(view.projectiles[0]).toMatchObject({ id: 9, x: 250, y: 500 });
  });

  it('정적 맵', () => {
    const map = toRenderMap(STAGE_E1);
    expect(map).toMatchObject({ width: 9000, height: 15000 });
    expect(map.slots).toHaveLength(8);
    expect(map.groundPaths[0]).toEqual(STAGE_E1.map.groundPaths[0].points);
  });
});

describe('toRenderView — 궁극 표시', () => {
  it('주기 궁극이 있는 단계만 ultimate — 궁극 없는 Lv5 분기는 고리를 그리지 않는다', () => {
    for (const kind of TOWERS.map((t) => t.id)) {
      for (const branch of [1, 2]) {
        const state = createGame(findStage('s8')!, 1);
        state.gold = 1e6;
        applyCommand(state, OP.BUILD, 0, kind);
        applyCommand(state, OP.UPGRADE, 0);
        applyCommand(state, OP.UPGRADE, 0);
        applyCommand(state, OP.BRANCH, 0, branch - 1);
        applyCommand(state, OP.UPGRADE, 0);
        const view = toRenderView(state, createRenderView());
        expect([kind, branch, view.towers[0].level, view.towers[0].ultimate]).toEqual([kind, branch, 5, ultimatePeriod(kind, 5, branch) > 0]);
      }
    }
  });
});
