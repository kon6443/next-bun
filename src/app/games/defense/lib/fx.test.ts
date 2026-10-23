import { describe, it, expect } from 'vitest';
import { EVENT, STATUS } from '../engine';
import { SOUND } from '../audio/sfx';
import { DamageNumberPool, EFFECT_KIND, EffectPool, ParticlePool } from '../renderer/particles';
import { type RenderView, createRenderView } from '../renderer/renderView';
import { PARTICLES_PER_TICK, applyTickEvents, createTickNotice, findById } from './fx';

function views(): { view: RenderView; prev: RenderView } {
  const view = createRenderView();
  const prev = createRenderView();
  view.enemies.push({ id: 5, kind: 0, x: 1000, y: 1000, hp: 5, maxHp: 10, effects: 0, air: false });
  prev.enemies.push({ id: 4, kind: 1, x: 2000, y: 2000, hp: 1, maxHp: 10, effects: 0, air: false }, { id: 5, kind: 0, x: 900, y: 900, hp: 5, maxHp: 10, effects: 0, air: false });
  prev.projectiles.push({ id: 70, x: 0, y: 0, element: 2, damageType: 1 });
  view.towers.push({ id: 2, slot: 0, kind: 1, level: 1, branch: 0, x: 500, y: 500, targetId: 0, ultCooldown: 0, ultimate: false });
  return { view, prev };
}

const pools = () => ({ particles: new ParticlePool(400), numbers: new DamageNumberPool(40), effects: new EffectPool(16) });
const ev = (...xs: number[][]) => xs.flatMap((x) => [x[0], x[1] ?? 0, x[2] ?? 0, x[3] ?? 0]);

describe('렌더 이벤트 → 연출·효과음 (lib/fx)', () => {
  it('명중 — 투사체 원소 색 파티클 + 피해 숫자(설정), 이번 틱에 빠진 적은 직전 위치', () => {
    const { view, prev } = views();
    const p = pools();
    applyTickEvents(ev([EVENT.HIT, 5, 7, 70], [EVENT.HIT, 4, 3, 99]), view, prev, p, createTickNotice(), true);
    expect(p.particles.count).toBe(6);
    expect(Array.from(p.particles.color.slice(0, 3))).toEqual([2, 2, 2]);
    expect(p.particles.color[3]).toBe(0);
    expect(p.particles.x[3]).toBe(2000);
    expect(p.numbers.count).toBe(2);
    const q = pools();
    applyTickEvents(ev([EVENT.HIT, 5, 7, 70]), view, prev, q, createTickNotice(), false);
    expect(q.numbers.count).toBe(0);
  });

  it('누수·보스 등장·발사음·충격파·번개를 알린다', () => {
    const { view, prev } = views();
    const p = pools();
    const notice = applyTickEvents(
      ev([EVENT.LEAK, 4, 3], [EVENT.SPAWN, 9, 10], [EVENT.FIRE, 2, 70, 5], [EVENT.PULSE, 2, 1500], [EVENT.CHAIN, 5, 4, 2], [EVENT.STATUS, 5, STATUS.BURN, 1]),
      view,
      prev,
      p,
      createTickNotice(),
      true,
    );
    expect(notice.leakedLives).toBe(3);
    expect(notice.bossSpawned).toBe(10);
    expect(notice.sounds).toEqual([SOUND.LEAK, SOUND.BOSS, SOUND.FIRE_CANNON, SOUND.EXPLODE]);
    expect(p.effects.count).toBe(2);
    expect([p.effects.color[0], p.effects.size[0]]).toEqual([EFFECT_KIND.RING, 1500]);
    expect([p.effects.color[1], p.effects.x2[1]]).toEqual([EFFECT_KIND.BOLT, 2000]);
    expect(p.particles.color[0]).toBe(1); // 화상 = 불
  });

  it('한 틱 파티클 상한 · notice는 재사용해도 앞 틱 값이 남지 않는다', () => {
    const { view, prev } = views();
    const p = pools();
    const notice = createTickNotice();
    const many = ev(...Array.from({ length: 40 }, () => [EVENT.DEATH, 5, 0, 0]));
    applyTickEvents(many, view, prev, p, notice, true);
    expect(p.particles.count).toBe(PARTICLES_PER_TICK);
    applyTickEvents(ev([EVENT.LEAK, 4, 1]), view, prev, p, notice, true);
    applyTickEvents([], view, prev, p, notice, true);
    expect([notice.leakedLives, notice.bossSpawned, notice.sounds.length]).toEqual([0, -1, 0]);
  });

  it('findById — id 오름차순 이분 탐색', () => {
    const list = [1, 3, 8, 13].map((id) => ({ id }));
    expect(findById(list, 8)?.id).toBe(8);
    expect(findById(list, 4)).toBeNull();
    expect(findById([], 1)).toBeNull();
  });
});
