/**
 * 시뮬레이터 — 봇 판단용 가치 표 (부동소수 허용, 엔진 계약 밖 §S7)
 *   환산 DPS: tower_curve_check.py와 같은 정의 — (피해 × 30 / 주기 × 평균 배율 + 지속 DPS) × 역할 계수
 *   경로 커버: 슬롯 사거리 안에 들어오는 경로 길이(지상·공중 따로) — 맵 데이터로 미리 계산
 */

import {
  DAMAGE,
  ENEMIES,
  type GameMap,
  type GameState,
  STATUS,
  TOWERS,
  type TowerStage,
  type Wave,
  towerStage,
} from '../../engine';

/** [kind][stageIndex] 평균 배율·역할 계수 — stageIndex: Lv1~3 = 0~2, 분기 1 Lv4·Lv5 = 3·4, 분기 2 Lv4·Lv5 = 5·6 */
const AVG_COEF: readonly (readonly [number, number][])[] = [
  [[1, 1.05], [1, 1.05], [1, 1.05], [1, 1.05], [1.6, 1.05], [1, 1.05], [1, 1.05]],
  [[1, 1.6], [1, 1.6], [1, 1.6], [1, 1.6], [1, 1.6], [1, 1.2], [1, 1.2]],
  [[1, 1], [1, 1], [1, 1], [1.3, 1], [1.5, 1], [1, 1.15], [1.1, 1.15]],
  [[1, 2.8], [1, 2.8], [1, 2.8], [1, 2.9], [1, 3.0], [1, 2.9], [1, 3.0]],
  [[1, 0.65], [1, 0.65], [1, 0.65], [1, 1.04], [1, 1.04], [1, 0.65], [1, 0.65]],
  [[1, 1.6], [1, 1.6], [1, 1.6], [1, 2.1], [1, 2.1], [1, 1.6], [1, 1.6]],
];

function stageIndex(level: number, branch: number): number {
  if (level <= 3) return level - 1;
  return 3 + (branch - 1) * 2 + (level - 4);
}

function dotDps(stage: TowerStage): number {
  let dps = 0;
  for (const s of stage.status) {
    if (s.status === STATUS.BURN) dps += s.value;
    if (s.status === STATUS.POISON) dps += s.value * (s.cap ?? 1);
  }
  return dps;
}

/** 환산 DPS (§L4 곡선과 같은 단위) */
export function convertedDps(kind: number, level: number, branch: number): number {
  const stage = towerStage(TOWERS[kind], level, branch);
  const [avg, coef] = AVG_COEF[kind][stageIndex(level, branch)];
  return ((stage.damage * 30) / stage.periodTicks * avg + dotDps(stage)) * coef;
}

// ---- 경로 커버 ----

function coveredLength(points: readonly number[], x: number, y: number, range: number): number {
  let total = 0;
  for (let i = 0; i + 3 < points.length; i += 2) {
    const [x0, y0, x1, y1] = [points[i], points[i + 1], points[i + 2], points[i + 3]];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(len / 100));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      if (Math.hypot(x0 + (x1 - x0) * t - x, y0 + (y1 - y0) * t - y) <= range) total += len / n;
    }
  }
  return total;
}

export type SlotCover = { ground: number; air: number };

const coverCache = new Map<string, SlotCover>();

/** 슬롯의 경로 커버 비율 — 사거리 지름(2r) 대비 덮는 경로 길이(갈래 합). 명당은 1을 넘는다 */
export function slotCover(map: GameMap, slot: number, range: number): SlotCover {
  const key = `${map.id}:${slot}:${range}`;
  const cached = coverCache.get(key);
  if (cached) return cached;
  const { x, y } = map.slots[slot];
  let ground = 0;
  for (const p of map.groundPaths) ground += coveredLength(p.points, x, y, range);
  let air = 0;
  for (const p of map.airPaths) air += coveredLength(p.points, x, y, range);
  // 공중 경로가 없는 맵은 공중 적도 지상 경로를 쓴다
  if (map.airPaths.length === 0) air = ground;
  const cover = { ground: ground / (2 * range), air: air / (2 * range) };
  coverCache.set(key, cover);
  return cover;
}

// ---- 다가오는 적 구성 ----

export type Threat = {
  /** HP 비중 — 지상·공중 */
  ground: number;
  air: number;
  /** HP 가중 평균 저항 ‰ — 물리·마법 */
  resistPhy: number;
  resistMag: number;
};

const NONE: Threat = { ground: 1, air: 0, resistPhy: 0, resistMag: 0 };

/** 웨이브 하나의 구성 비율 (웨이브 안 HP 비중) — 웨이브끼리는 같은 무게로 평균해 웨이브 HP 크기와 무관하게 한다 */
function waveShares(wave: Wave | undefined): Threat | null {
  if (!wave) return null;
  let hp = 0;
  let air = 0;
  let phy = 0;
  let mag = 0;
  for (const g of wave.groups) {
    const kind = ENEMIES[g.enemyId];
    const total = g.hp * g.count * kind.swarm;
    hp += total;
    if (kind.air) air += total;
    phy += total * kind.resistPhy;
    mag += total * kind.resistMag;
  }
  if (hp === 0) return null;
  return { ground: 1 - air / hp, air: air / hp, resistPhy: phy / hp, resistMag: mag / hp };
}

/** 미리보기가 진행 중 웨이브 뒤로 읽는 웨이브 수 — upcomingThreat의 waves[current]·[current + 1] (generate.ts 램프 무관 앞부분 경계가 쓴다) */
export const PREVIEW_AHEAD = 2;

/** 지금 싸우는 웨이브 + 다음 두 웨이브(웨이브 미리보기 — §F2)의 구성 비율 평균 */
export function upcomingThreat(state: GameState, preview: readonly Wave[] | null = null): Threat {
  const waves = preview ?? state.board.waves;
  const current = state.wavesStarted;
  const list: Threat[] = [];
  const add = (wave: Wave | undefined) => {
    const shares = waveShares(wave);
    if (shares) list.push(shares);
  };
  if (current > 0 && state.countdown === 0) add(waves[current - 1]);
  add(waves[current]);
  add(waves[current + 1]);
  if (list.length === 0) return NONE;
  const avg = (pick: (t: Threat) => number) => list.reduce((sum, t) => sum + pick(t), 0) / list.length;
  return { ground: avg((t) => t.ground), air: avg((t) => t.air), resistPhy: avg((t) => t.resistPhy), resistMag: avg((t) => t.resistMag) };
}

/** 타워 단계가 이 구성에 실제로 내는 화력 비율 (경로 커버 × 대상 × 저항) */
export function effectiveness(state: GameState, slot: number, kind: number, level: number, branch: number, threat: Threat): number {
  const stage = towerStage(TOWERS[kind], level, branch);
  const cover = slotCover(state.board.map, slot, stage.range);
  const reach = (stage.hitsGround ? threat.ground * Math.min(2, cover.ground) : 0) + (stage.hitsAir ? threat.air * Math.min(2, cover.air) : 0);
  const damageType = TOWERS[kind].damageType;
  const resist = damageType === DAMAGE.PHY ? threat.resistPhy : damageType === DAMAGE.MAG ? threat.resistMag : 0;
  return reach * (1 - Math.min(800, resist) / 1000);
}
