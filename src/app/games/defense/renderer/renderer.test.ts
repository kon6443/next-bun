import { describe, it, expect } from 'vitest';
import { interpolatePositions } from './interpolate';
import { DamageNumberPool, ParticlePool } from './particles';
import { COLORS, ENEMY_COLORS, ENEMY_SCALE, TOWER_COLORS } from './palette';
import { QUALITY_LEVELS, QualityController } from './quality';
import { createRenderView, type RenderView } from './renderView';
import { createSceneScratch, drawSceneLayer, traceEnemyBody } from './sceneLayer';
import { backingSize, fitViewport } from './viewport';

describe('fitViewport — 세로 9×15 맵 레터박스 (D-021)', () => {
  it('비율 유지·가운데 정렬, DPR은 상한으로 자른다', () => {
    const vp = fitViewport(390, 844, 9000, 15000, 3, 2);
    expect(vp.scale).toBeCloseTo(390 / 9000);
    expect(vp.offsetX).toBe(0);
    expect(vp.offsetY).toBeCloseTo((844 - 15000 * vp.scale) / 2);
    expect(vp.dpr).toBe(2);
    expect(backingSize(vp)).toEqual({ width: 780, height: 1688 });
    const wide = fitViewport(1200, 600, 9000, 15000, 1, 2);
    expect(wide.scale).toBeCloseTo(600 / 15000);
    expect(wide.offsetY).toBe(0);
    expect(wide.offsetX).toBeCloseTo((1200 - 9000 * wide.scale) / 2);
    expect(fitViewport(100, 100, 9000, 15000, 0, 2).dpr).toBe(1);
  });
});

describe('interpolatePositions — id로 짝지어 보간', () => {
  it('같은 id는 alpha만큼, 새로 생긴 것은 현재 좌표, 사라진 것은 건너뛴다', () => {
    const prev = [{ id: 1, x: 0, y: 0 }, { id: 2, x: 100, y: 100 }, { id: 3, x: 50, y: 50 }];
    const curr = [{ id: 2, x: 200, y: 100 }, { id: 3, x: 50, y: 150 }, { id: 9, x: 7, y: 8 }];
    const out = interpolatePositions(prev, curr, 0.25, new Float32Array(2));
    expect(Array.from(out.slice(0, 6))).toEqual([125, 100, 50, 75, 7, 8]);
  });

  it('버퍼가 충분하면 그대로 쓴다(프레임당 할당 없음)', () => {
    const buf = new Float32Array(64);
    expect(interpolatePositions([], [{ id: 1, x: 1, y: 2 }], 0.5, buf)).toBe(buf);
  });
});

describe('ParticlePool — 고정 용량 SoA', () => {
  it('가득 차면 돌림 순서로 자리를 덮어쓰고, 수명이 다하면 지운다', () => {
    const pool = new ParticlePool(3);
    for (let i = 0; i < 5; i++) pool.spawn(i, 0, 0, 0, 100 + i * 100, 0);
    expect(pool.count).toBe(3);
    expect(Array.from(pool.x)).toEqual([3, 4, 2]);
    pool.update(350);
    expect(pool.count).toBe(2); // 수명 300(x=2)이 사라짐
    pool.update(1000);
    expect(pool.count).toBe(0);
  });

  it('품질을 낮추면(setLimit) 그 칸 수 안에서만 돌려 쓰고 넘치는 것은 지운다 — 배열은 그대로 (FE-09)', () => {
    const pool = new ParticlePool(4);
    for (let i = 0; i < 4; i++) pool.spawn(i, 0, 0, 0, 1000, 0);
    pool.setLimit(2);
    expect(pool.count).toBe(2);
    expect(pool.x.length).toBe(4);
    const slots = [pool.spawn(9, 0, 0, 0, 1000, 0), pool.spawn(9, 0, 0, 0, 1000, 0), pool.spawn(9, 0, 0, 0, 1000, 0)];
    expect(slots.every((i) => i < 2)).toBe(true);
    expect(pool.count).toBe(2);
  });

  it('이동: 속도(밀리타일/초) × 시간', () => {
    const pool = new ParticlePool(1);
    pool.spawn(0, 0, 1000, -500, 1000, 0);
    pool.update(500);
    expect([pool.x[0], pool.y[0]]).toEqual([500, -250]);
  });

  it('데미지 숫자는 값을 같은 자리에 둔다 — 덮어써도·지워져 자리를 옮겨도 값이 따라간다', () => {
    const pool = new DamageNumberPool(3);
    pool.spawnNumber(0, 0, 11, 100);
    pool.spawnNumber(0, 0, 22, 500);
    pool.spawnNumber(0, 0, 33, 500);
    pool.spawnNumber(0, 0, 44, 500); // 첫 자리 덮어씀
    expect(Array.from(pool.value)).toEqual([44, 22, 33]);
    pool.spawnNumber(0, 0, 55, 100); // 둘째 자리 덮어씀 (수명 100)
    pool.update(200); // 수명 100인 55가 지워지고 33이 그 자리로
    expect(pool.count).toBe(2);
    expect(Array.from(pool.value.slice(0, pool.count)).sort()).toEqual([33, 44]);
  });
});

describe('QualityController — 예산 초과 2초 지속 시 한 단계씩 (§F10)', () => {
  it('자동: 7ms 넘는 상태가 2초 이어지면 단계를 내리고, 예산 안으로 돌아오면 타이머가 풀린다', () => {
    const q = new QualityController('auto');
    let now = 0;
    for (; now < 1900; now += 16) q.record(12, now);
    expect(q.level).toBe(0);
    q.record(1, now); // 평균이 곧바로 내려가진 않는다 — 이동평균
    let changed = false;
    for (; now < 6000 && !changed; now += 16) changed = q.record(12, now);
    expect(changed).toBe(true);
    expect(q.level).toBe(1);
    expect(q.current).toEqual(QUALITY_LEVELS[1]);
  });

  it('맨 아래 단계에서 멈추고, 높음·낮음 모드는 고정', () => {
    const q = new QualityController('auto');
    for (let now = 0; now < 60000; now += 16) q.record(50, now);
    expect(q.level).toBe(QUALITY_LEVELS.length - 1);
    q.setMode('high');
    for (let now = 0; now < 10000; now += 16) q.record(50, now);
    expect(q.level).toBe(0);
    q.setMode('low');
    expect(q.current.dprCap).toBe(1);
  });
});

/** 기록용 가짜 2D 컨텍스트 — 호출 수·금지 속성 사용을 센다 */
function recordingContext() {
  const calls: Record<string, number> = {};
  const assigned = new Set<string>();
  const state = { fontAssignments: 0 };
  const ctx = new Proxy(
    {},
    {
      get(_t, prop: string) {
        return () => {
          calls[prop] = (calls[prop] ?? 0) + 1;
        };
      },
      set(_t, prop: string) {
        assigned.add(prop);
        if (prop === 'font') state.fontAssignments += 1;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return {
    ctx,
    calls,
    assigned,
    get fontAssignments() {
      return state.fontAssignments;
    },
  };
}

function view(enemies: number, projectiles: number): RenderView {
  const v = createRenderView();
  for (let i = 0; i < enemies; i++) v.enemies.push({ id: i + 1, kind: 0, x: i * 10, y: i * 10, hp: i % 2 ? 50 : 100, maxHp: 100, air: i % 4 === 0 });
  for (let i = 0; i < projectiles; i++) v.projectiles.push({ id: 10000 + i, x: i, y: i, element: i % 5, damageType: i % 2 });
  v.towers.push({ id: 1, slot: 0, kind: 0, level: 3, branch: 0, x: 3500, y: 3000, targetId: 2, ultCooldown: 0, ultimate: false });
  return v;
}

describe('drawSceneLayer — 묶어 그리기·금지 API', () => {
  const vp = fitViewport(390, 650, 9000, 15000, 2, 2);
  const frame = (v: RenderView, showDamageNumbers: boolean) => {
    const particles = new ParticlePool(400);
    const numbers = new DamageNumberPool(40);
    for (let i = 0; i < 400; i++) particles.spawn(i, i, 0, 0, 500, i % 5);
    for (let i = 0; i < 40; i++) numbers.spawnNumber(i, i, i, 500);
    return { prev: v, curr: v, alpha: 0.5, particles, numbers, showDamageNumbers, timeMs: 0 };
  };

  it('fill 호출 수는 엔티티 수와 무관하다 (적 10 vs 200, 투사체 10 vs 400)', () => {
    const small = recordingContext();
    drawSceneLayer(small.ctx, frame(view(10, 10), false), vp, createSceneScratch());
    const big = recordingContext();
    drawSceneLayer(big.ctx, frame(view(200, 400), false), vp, createSceneScratch());
    expect(big.calls.fill).toBe(small.calls.fill);
    expect(big.calls.fill).toBeLessThan(25);
    expect(big.calls.arc).toBeGreaterThan(small.calls.arc);
  });

  it('타워 6종·적 12종(지상·공중) 모두 제 색으로 그린다 — 없는 종류는 fill하지 않는다', () => {
    const fills: string[] = [];
    let style = '';
    const ctx = new Proxy(
      {},
      {
        get: (_t, prop: string) => () => {
          if (prop === 'fill') fills.push(style);
        },
        set: (_t, prop: string, value) => {
          if (prop === 'fillStyle') style = String(value);
          return true;
        },
      },
    ) as unknown as CanvasRenderingContext2D;
    const v = createRenderView();
    TOWER_COLORS.forEach((_, kind) => v.towers.push({ id: kind + 1, slot: kind, kind, level: 1, branch: 0, x: 1000 * kind, y: 1000, targetId: 0, ultCooldown: 0, ultimate: false }));
    ENEMY_COLORS.forEach((_, kind) => v.enemies.push({ id: kind + 1, kind, x: 500 * kind, y: 5000, hp: 10, maxHp: 10, air: kind % 2 === 1 }));
    drawSceneLayer(ctx, frame(v, false), vp, createSceneScratch());
    for (const color of [...TOWER_COLORS, ...ENEMY_COLORS]) expect(fills).toContain(color);
    const towersOnly = createRenderView();
    towersOnly.towers.push({ id: 1, slot: 0, kind: 1, level: 1, branch: 0, x: 0, y: 0, targetId: 0, ultCooldown: 0, ultimate: false });
    fills.length = 0;
    // 파티클·투사체 없이 — 원소·피해 색이 타워 색과 겹친다(대포 = 물리, 서리 = 얼음, 테슬라 = 번개)
    const empty = { prev: towersOnly, curr: towersOnly, alpha: 1, particles: new ParticlePool(1), numbers: new DamageNumberPool(1), showDamageNumbers: false, timeMs: 0 };
    drawSceneLayer(ctx, empty, vp, createSceneScratch());
    expect(fills.filter((c) => TOWER_COLORS.includes(c))).toEqual([TOWER_COLORS[1]]);
  });

  it('데미지 숫자를 그릴 때마다 글꼴을 대입한다 — 캔버스 리사이즈로 컨텍스트 상태가 초기화돼도 크기가 유지된다', () => {
    const r = recordingContext();
    drawSceneLayer(r.ctx, frame(view(5, 5), true), vp, createSceneScratch());
    drawSceneLayer(r.ctx, frame(view(5, 5), true), vp, createSceneScratch());
    expect(r.fontAssignments).toBe(2);
  });

  it('shadowBlur·filter를 쓰지 않고, save/restore 없음, fillText는 데미지 숫자를 켤 때만', () => {
    const off = recordingContext();
    drawSceneLayer(off.ctx, frame(view(50, 50), false), vp, createSceneScratch());
    expect(off.assigned.has('shadowBlur')).toBe(false);
    expect(off.assigned.has('filter')).toBe(false);
    expect(off.calls.save ?? 0).toBe(0);
    expect(off.calls.fillText ?? 0).toBe(0);
    const on = recordingContext();
    drawSceneLayer(on.ctx, frame(view(50, 50), true), vp, createSceneScratch());
    expect(on.calls.fillText).toBe(40);
  });
});

/** 경로 명령 기록 — 이름과 반올림한 인자. fill·stroke 때 그 path와 스타일을 묶어 남긴다 */
function pathRecorder() {
  const ops: string[] = [];
  const draws: { op: 'fill' | 'stroke'; style: string; lineWidth: number; path: string[] }[] = [];
  const style = { fillStyle: '', strokeStyle: '', lineWidth: 1 };
  const ctx = new Proxy(
    {},
    {
      get: (_t, prop: string) =>
        (...args: number[]) => {
          if (prop === 'beginPath') ops.length = 0;
          else if (prop === 'fill' || prop === 'stroke') draws.push({ op: prop, style: prop === 'fill' ? style.fillStyle : style.strokeStyle, lineWidth: style.lineWidth, path: [...ops] });
          else ops.push(`${prop}(${args.map((a) => (typeof a === 'number' ? Math.round(a * 100) / 100 : a)).join(',')})`);
        },
      set: (_t, prop: string, value) => {
        if (prop in style) (style as Record<string, unknown>)[prop] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, ops, draws };
}

describe('적 종류별 모양 — 색만으로 구분하지 않는다 (§F0-4)', () => {
  it('12종의 외곽 경로가 서로 다르다 (박쥐·용은 같은 날개, 크기로 다르다)', () => {
    const shapes = ENEMY_COLORS.map((_, kind) => {
      const rec = pathRecorder();
      traceEnemyBody(rec.ctx, kind, 100, 100, 10 * (ENEMY_SCALE[kind] ?? 1));
      return rec.ops.join(' ');
    });
    expect(new Set(shapes).size).toBe(ENEMY_COLORS.length);
  });

  it('졸개는 원(arc), 질주병은 직선 마름모 — 한 화면에 섞여도 각자 모양으로 그리고 2px 이상 어두운 윤곽을 두른다', () => {
    const vp = fitViewport(390, 650, 9000, 15000, 2, 2);
    const v = createRenderView();
    v.enemies.push({ id: 1, kind: 0, x: 2000, y: 5000, hp: 10, maxHp: 10, air: false });
    v.enemies.push({ id: 2, kind: 1, x: 4000, y: 5000, hp: 10, maxHp: 10, air: false });
    const rec = pathRecorder();
    drawSceneLayer(rec.ctx, { prev: v, curr: v, alpha: 1, particles: new ParticlePool(1), numbers: new DamageNumberPool(1), showDamageNumbers: false, timeMs: 0 }, vp, createSceneScratch());
    const body = (color: string) => rec.draws.find((d) => d.op === 'fill' && d.style === color)!;
    const grunt = body(ENEMY_COLORS[0]);
    const runner = body(ENEMY_COLORS[1]);
    expect(grunt.path.some((o) => o.startsWith('arc('))).toBe(true);
    expect(grunt.path.some((o) => o.startsWith('lineTo('))).toBe(false);
    expect(runner.path.filter((o) => o.startsWith('lineTo(')).length).toBe(3);
    expect(runner.path.some((o) => o.startsWith('arc('))).toBe(false);
    // 몸을 채운 바로 다음 같은 경로를 배경색으로 두른다
    for (const fill of [grunt, runner]) {
      const outline = rec.draws[rec.draws.indexOf(fill) + 1];
      expect(outline).toMatchObject({ op: 'stroke', style: COLORS.background, path: fill.path });
      expect(outline.lineWidth).toBeGreaterThanOrEqual(2);
    }
  });
});
