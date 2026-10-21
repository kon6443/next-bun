import { describe, it, expect } from 'vitest';
import { DamageNumberPool, ParticlePool } from '../renderer/particles';
import { createEngineScene, createSyntheticScene } from './benchScene';
import { isDefenseDevEnabled } from './devGate';
import { RollingStats } from './frameStats';

describe('측정 화면 노출 (D-020)', () => {
  it('운영 빌드는 막고, 개발 서버·명시 플래그 빌드는 연다', () => {
    expect(isDefenseDevEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(isDefenseDevEnabled({ NODE_ENV: 'production', NEXT_PUBLIC_DEFENSE_DEV: '0' })).toBe(false);
    expect(isDefenseDevEnabled({ NODE_ENV: 'production', NEXT_PUBLIC_DEFENSE_DEV: '1' })).toBe(true);
    expect(isDefenseDevEnabled({ NODE_ENV: 'development' })).toBe(true);
  });
});

describe('RollingStats', () => {
  it('평균·p95·최대, 용량을 넘으면 오래된 표본부터 밀려난다', () => {
    const s = new RollingStats(100);
    for (let i = 1; i <= 100; i++) s.push(i);
    expect(s.summary()).toEqual({ avg: 50.5, p95: 96, max: 100 });
    for (let i = 0; i < 100; i++) s.push(1);
    expect(s.summary()).toEqual({ avg: 1, p95: 1, max: 1 });
    s.reset();
    expect(s.summary()).toEqual({ avg: 0, p95: 0, max: 0 });
  });
});

const pools = () => ({ particles: new ParticlePool(400), numbers: new DamageNumberPool(40), particleScale: 1 });

describe('측정 장면', () => {
  it('합성: 요청한 수만큼, id 오름차순(보간 짝짓기 전제), 틱마다 이전·현재가 바뀐다', () => {
    const scene = createSyntheticScene({ enemies: 200, projectiles: 400, particles: 300 });
    const p = pools();
    for (let i = 0; i < 30; i++) scene.tick(p);
    expect(scene.curr.enemies).toHaveLength(200);
    expect(scene.curr.projectiles).toHaveLength(400);
    for (const list of [scene.curr.enemies, scene.curr.projectiles]) {
      for (let i = 1; i < list.length; i++) expect(list[i].id).toBeGreaterThan(list[i - 1].id);
    }
    expect(scene.prev).not.toBe(scene.curr);
    expect(p.particles.count).toBeGreaterThanOrEqual(300);
    scene.setCounts({ enemies: 10, projectiles: 0, particles: 0 });
    scene.tick(p);
    expect(scene.curr.enemies).toHaveLength(10);
  });

  it('합성: 투사체 id는 오래 돌려도(20,000틱+, 비행 회차가 1000을 넘어도) 오름차순', () => {
    const scene = createSyntheticScene({ enemies: 0, projectiles: 30, particles: 0 });
    const p = pools();
    for (let i = 0; i < 21000; i++) scene.tick(p);
    const ids = scene.curr.projectiles.map((x) => x.id);
    for (let i = 1; i < ids.length; i++) expect(ids[i]).toBeGreaterThan(ids[i - 1]);
  });

  it('엔진 구동: 적 수를 유지하고 타워가 쏜다, step 시간을 돌려준다', () => {
    const scene = createEngineScene({ enemies: 200, projectiles: 0, particles: 0 });
    const p = pools();
    let ms = 0;
    let maxProjectiles = 0;
    for (let i = 0; i < 120; i++) {
      ms += scene.tick(p);
      maxProjectiles = Math.max(maxProjectiles, scene.curr.projectiles.length); // 8개가 같은 주기로 쏴서 0인 틱도 있다
    }
    expect(scene.curr.enemies.length).toBe(200);
    expect(scene.curr.towers).toHaveLength(8);
    expect(maxProjectiles).toBeGreaterThan(0);
    expect(ms).toBeGreaterThan(0);
    expect(p.numbers.count).toBeGreaterThan(0);
  });
});
