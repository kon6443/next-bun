import {
  ENEMY_STATUS,
  EVENT,
  EVENT_STRIDE,
  type GameState,
  OP,
  STAGE_E1,
  applyCommand,
  createGame,
  step,
} from '../engine';
import type { DamageNumberPool, ParticlePool } from '../renderer/particles';
import { type RenderMap, type RenderView, createRenderView } from '../renderer/renderView';
import { toRenderMap, toRenderView } from './toRenderView';

/**
 * 측정 화면용 장면 — 렌더러 단독(합성) 또는 엔진 구동. 틱(30Hz)마다 이전·현재 렌더 상태를 바꿔 끼워 보간을 함께 잰다
 * 개발 도구라 엔진 상태에 적을 직접 넣는다(엔진 밖 코드)
 */
export type BenchMode = 'synthetic' | 'engine';
export type BenchCounts = { enemies: number; projectiles: number; particles: number };

export type BenchScene = {
  readonly map: RenderMap;
  prev: RenderView;
  curr: RenderView;
  /** 1틱 진행 — 파티클·데미지 숫자는 pools에 직접 낸다. 엔진 모드면 step 시간(ms)을 돌려준다 */
  tick(pools: { particles: ParticlePool; numbers: DamageNumberPool; particleScale: number }): number;
  setCounts(counts: BenchCounts): void;
};

const PATH = STAGE_E1.map.groundPaths[0];
const SPEED = 33;
const SPARK = 0;

/** 경로 위 거리 d의 좌표(부동소수 — 렌더러 쪽 계산) */
function pointAt(d: number): [number, number] {
  let rest = ((d % PATH.total) + PATH.total) % PATH.total;
  const p = PATH.points;
  for (let i = 0; i < PATH.segmentLengths.length; i++) {
    const len = PATH.segmentLengths[i];
    if (rest <= len) {
      const t = rest / len;
      return [p[i * 2] + (p[i * 2 + 2] - p[i * 2]) * t, p[i * 2 + 1] + (p[i * 2 + 3] - p[i * 2 + 1]) * t];
    }
    rest -= len;
  }
  return [p[p.length - 2], p[p.length - 1]];
}

/** 목표 수만큼 주변 파티클을 유지 (수명 600ms) */
function keepAmbientParticles(particles: ParticlePool, target: number, curr: RenderView, scale: number): void {
  const want = Math.floor(target * scale);
  for (let n = 0; particles.count < want && n < 40; n++) {
    const e = curr.enemies.length ? curr.enemies[(Math.random() * curr.enemies.length) | 0] : null;
    const x = e ? e.x : Math.random() * 9000;
    const y = e ? e.y : Math.random() * 15000;
    particles.spawn(x, y, (Math.random() - 0.5) * 1600, (Math.random() - 0.5) * 1600, 600, 1 + ((Math.random() * 4) | 0));
  }
}

export function createSyntheticScene(initial: BenchCounts): BenchScene {
  let counts = initial;
  let frame = 0;
  let prev = createRenderView();
  let curr = createRenderView();
  const towers = STAGE_E1.map.slots.map((slot, i) => ({
    id: i + 1, slot: i, kind: 0, level: 1 + (i % 3), branch: 0, x: slot.x, y: slot.y, targetId: 0, ultCooldown: 0,
  }));

  const scene: BenchScene = {
    map: toRenderMap(STAGE_E1),
    prev,
    curr,
    setCounts(next) {
      counts = next;
    },
    tick({ particles, numbers, particleScale }) {
      frame++;
      [prev, curr] = [curr, prev];
      scene.prev = prev;
      scene.curr = curr;
      curr.tick = frame;
      // 적: 경로에 고르게, 같은 id를 유지해 보간이 맞물린다
      curr.enemies.length = counts.enemies;
      for (let i = 0; i < counts.enemies; i++) {
        const [x, y] = pointAt((i * PATH.total) / Math.max(1, counts.enemies) + frame * SPEED);
        const e = curr.enemies[i] ?? (curr.enemies[i] = { id: 0, kind: 0, x: 0, y: 0, hp: 0, maxHp: 0, effects: 0, air: false });
        e.id = 1000 + i;
        e.kind = 0;
        e.x = x;
        e.y = y;
        e.maxHp = 100;
        e.hp = i % 3 === 0 ? 100 : 20 + ((i * 37 + frame) % 80);
        e.air = i % 5 === 0;
        e.effects = 0;
      }
      curr.towers.length = towers.length;
      for (let i = 0; i < towers.length; i++) {
        const t = (curr.towers[i] = curr.towers[i] ?? { ...towers[i] });
        Object.assign(t, towers[i]);
        t.targetId = counts.enemies ? 1000 + ((i * 7 + frame) % counts.enemies) : 0;
      }
      // 투사체: 타워에서 표적으로 20틱 비행, 끝나면 명중 연출 후 다시
      curr.projectiles.length = counts.projectiles;
      for (let i = 0; i < counts.projectiles; i++) {
        const tower = towers[i % towers.length];
        const phase = (frame + i * 3) % 20;
        const target = counts.enemies ? curr.enemies[(i * 13) % counts.enemies] : null;
        const tx = target ? target.x : 4500;
        const ty = target ? target.y : 7500;
        const p = curr.projectiles[i] ?? (curr.projectiles[i] = { id: 0, x: 0, y: 0, element: 0, damageType: 0 });
        // 비행마다 새 id(보간 끊김 = 실제와 같음) — 비행 회차는 i에 대해 줄지 않으므로 회차 × 1000 + i는 i 오름차순이다
        p.id = 100000 + Math.floor((frame + i * 3) / 20) * 1000 + i;
        p.x = tower.x + (tx - tower.x) * (phase / 20);
        p.y = tower.y + (ty - tower.y) * (phase / 20);
        p.element = i % 5;
        p.damageType = i % 2;
        if (phase === 19) {
          for (let k = 0; k < Math.max(1, Math.round(3 * particleScale)); k++) {
            particles.spawn(tx, ty, (Math.random() - 0.5) * 2400, (Math.random() - 0.5) * 2400, 350, SPARK);
          }
          numbers.spawnNumber(tx, ty, 5 + (i % 40), 700);
        }
      }
      keepAmbientParticles(particles, counts.particles, curr, particleScale);
      return 0;
    },
  };
  return scene;
}

/** 엔진 구동: 궁수탑 Lv3 8개 + 적 counts.enemies(죽지 않는 HP, 끝에 닿으면 처음부터 다시 채움) — 투사체 수는 엔진이 정한다 */
export function createEngineScene(initial: BenchCounts): BenchScene {
  let counts = initial;
  const state: GameState = createGame(STAGE_E1, 1);
  state.gold = 100000;
  state.lives = 1000000000;
  for (let slot = 0; slot < STAGE_E1.map.slots.length; slot++) {
    applyCommand(state, OP.BUILD, slot, 0);
    applyCommand(state, OP.UPGRADE, slot);
    applyCommand(state, OP.UPGRADE, slot);
  }
  const events: number[] = [];
  let prev = createRenderView();
  let curr = createRenderView();

  function refill(): void {
    for (let n = state.aliveEnemies; n < counts.enemies; n++) {
      const dist = state.tick === 0 ? (n * PATH.total) / Math.max(1, counts.enemies) / 1.6 : 0;
      state.enemies.push({
        id: state.nextId++, kind: 0, hp: 1000000, maxHp: 1000000, path: 0, dist: Math.floor(dist), segment: 0, segmentStart: 0,
        x: PATH.points[0], y: PATH.points[1], wave: 1, reward: 0, status: ENEMY_STATUS.ALIVE,
      });
      state.aliveEnemies += 1;
      state.waves[0].total += 1;
      state.waves[0].pending += 1;
    }
  }

  const scene: BenchScene = {
    map: toRenderMap(STAGE_E1),
    prev,
    curr,
    setCounts(next) {
      counts = next;
    },
    tick({ particles, numbers, particleScale }) {
      refill();
      events.length = 0;
      const t0 = performance.now();
      step(state, events);
      const ms = performance.now() - t0;
      [prev, curr] = [curr, prev];
      scene.prev = prev;
      scene.curr = curr;
      toRenderView(state, curr);
      for (let i = 0; i < events.length; i += EVENT_STRIDE) {
        if (events[i] !== EVENT.HIT) continue;
        const enemy = curr.enemies.find((e) => e.id === events[i + 1]);
        if (!enemy) continue;
        for (let k = 0; k < Math.max(1, Math.round(3 * particleScale)); k++) {
          particles.spawn(enemy.x, enemy.y, (Math.random() - 0.5) * 2400, (Math.random() - 0.5) * 2400, 350, SPARK);
        }
        numbers.spawnNumber(enemy.x, enemy.y, events[i + 2], 700);
      }
      keepAmbientParticles(particles, counts.particles, curr, particleScale);
      return ms;
    },
  };
  return scene;
}
