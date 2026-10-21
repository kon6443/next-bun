import { describe, it, expect } from 'vitest';
import { KILL_REWARD_G_CAMPAIGN, MAX_ENEMY_HP, MAX_WAVE, PERMILLE, RESIST_CAP_PERMILLE, TILE } from './constants';
import { ENEMIES } from './data/enemies';
import { MAP_E1, type MapPath } from './data/maps';
import { STAGES } from './data/stages';
import { TOWERS } from './data/towers';

/** 테스트 파일은 결정성 규칙 밖 — 부동소수로 데이터를 검산한다 */
function segmentDistance(px: number, py: number, path: MapPath): number {
  let best = Infinity;
  const p = path.points;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const [x0, y0, x1, y1] = [p[i], p[i + 1], p[i + 2], p[i + 3]];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy)));
  }
  return best;
}

describe('맵 데이터 (D-021 세로 9×15 · §E1 정수 경로)', () => {
  it('9×15칸, 1칸 = 1000 밀리타일', () => {
    expect(MAP_E1.width).toBe(9 * TILE);
    expect(MAP_E1.height).toBe(15 * TILE);
  });

  for (const path of MAP_E1.groundPaths) {
    it('경로: 정수 좌표·맵 안·구간 길이 = 좌표 거리(반올림)·합계 = total', () => {
      const p = path.points;
      expect(p.length % 2).toBe(0);
      expect(path.segmentLengths).toHaveLength(p.length / 2 - 1);
      let total = 0;
      for (let i = 0; i < path.segmentLengths.length; i++) {
        const [x0, y0, x1, y1] = p.slice(i * 2, i * 2 + 4);
        for (const v of [x0, y0, x1, y1]) expect(Number.isInteger(v)).toBe(true);
        expect(x0 >= 0 && x0 <= MAP_E1.width && y0 >= 0 && y0 <= MAP_E1.height).toBe(true);
        expect(path.segmentLengths[i]).toBe(Math.round(Math.hypot(x1 - x0, y1 - y0)));
        expect(path.segmentLengths[i]).toBeGreaterThan(0);
        total += path.segmentLengths[i];
      }
      expect(path.total).toBe(total);
    });
  }

  it('빌드 슬롯 8개: 맵 안·서로 중심 간격 ≥ 1.1칸·경로 중심선에서 ≥ 1칸(받침이 길을 덮지 않게)', () => {
    const slots = MAP_E1.slots;
    expect(slots).toHaveLength(8);
    for (let i = 0; i < slots.length; i++) {
      const a = slots[i];
      expect(a.x > 0 && a.x < MAP_E1.width && a.y > 0 && a.y < MAP_E1.height).toBe(true);
      for (const path of MAP_E1.groundPaths) expect(segmentDistance(a.x, a.y, path)).toBeGreaterThanOrEqual(TILE);
      for (let j = i + 1; j < slots.length; j++) {
        expect(Math.hypot(a.x - slots[j].x, a.y - slots[j].y)).toBeGreaterThanOrEqual(1.1 * TILE);
      }
    }
  });

  it('공중 경로는 E1에서 자리만', () => {
    expect(MAP_E1.airPaths).toEqual([]);
  });
});

describe('타워·적·스테이지 데이터', () => {
  it('궁수탑 §C4: 8/18 · 13/18 · 19/18, 사거리 3.0 · 3.0 · 3.3칸, 비용 70 · +50 · +80', () => {
    expect(TOWERS[0].levels).toEqual([
      { cost: 70, damage: 8, periodTicks: 18, range: 3000 },
      { cost: 50, damage: 13, periodTicks: 18, range: 3000 },
      { cost: 80, damage: 19, periodTicks: 18, range: 3300 },
    ]);
    expect(TOWERS[0].hitsGround && TOWERS[0].hitsAir).toBe(true);
  });

  it('졸개 §C5: 지상·속도 33·저항 0·누수 1', () => {
    expect(ENEMIES[0]).toMatchObject({ air: false, speed: 33, resistPhy: 0, resistMag: 0, leakLives: 1 });
  });

  it('인덱스 = id', () => {
    TOWERS.forEach((t, i) => expect(t.id).toBe(i));
    ENEMIES.forEach((e, i) => expect(e.id).toBe(i));
  });

  for (const stage of STAGES) {
    it(`스테이지 ${stage.id}: 웨이브 수·그룹 참조·HP 상한`, () => {
      expect(stage.waves.length).toBeGreaterThan(0);
      expect(stage.waves.length).toBeLessThanOrEqual(MAX_WAVE);
      for (const t of stage.towers) expect(TOWERS[t]).toBeDefined();
      for (const wave of stage.waves) {
        expect(wave.groups.length).toBeGreaterThan(0);
        for (const g of wave.groups) {
          expect(ENEMIES[g.enemyId]).toBeDefined();
          expect(stage.map.groundPaths[g.path]).toBeDefined();
          expect(Number.isInteger(g.hp) && g.hp > 0 && g.hp <= MAX_ENEMY_HP).toBe(true);
          expect(g.count > 0 && g.intervalTicks > 0 && g.delayTicks >= 0).toBe(true);
        }
      }
    });
  }
});

describe('정수 안전 — 모든 중간값 < 2⁵³ (§E1)', () => {
  it('킬 보상 중간값: EHP(≤ HP × 2000 / 400) × G × K(1000‰)', () => {
    const maxEhp = Math.floor((MAX_ENEMY_HP * 2 * PERMILLE) / (2 * PERMILLE - 2 * RESIST_CAP_PERMILLE));
    expect(MAX_ENEMY_HP * 2 * PERMILLE).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(maxEhp * KILL_REWARD_G_CAMPAIGN * 1000).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it('피해·거리 제곱: 최대 피해 × 1000‰, 맵 대각선²', () => {
    const maxDamage = Math.max(...TOWERS.flatMap((t) => t.levels.map((l) => l.damage)));
    expect(maxDamage * PERMILLE).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(MAP_E1.width ** 2 + MAP_E1.height ** 2).toBeLessThan(2 ** 31); // 비트 연산 없이도 여유
    expect(Math.max(...TOWERS.flatMap((t) => t.levels.map((l) => l.range))) ** 2).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
});
