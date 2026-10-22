import { DAMAGE, ENEMIES, type GameState, type Stage, type TowerStage } from '../engine';

/**
 * 다음 웨이브 미리보기(§F2 하단) — 적 종류별 마리 수·지상/공중, 그리고 타워 상성 힌트(§F3 ▲/■/▼)
 * 웨이브 구성은 정적 데이터라 화면이 미리 보여 줘도 판에 영향이 없다
 */

export type PreviewEntry = { enemyId: number; count: number; air: boolean };

/** 다음에 시작할 웨이브(없으면 null) — 웨이브 중이면 그다음 웨이브 */
export function nextWaveIndex(state: GameState, stage: Stage): number | null {
  return state.wavesStarted < stage.waves.length ? state.wavesStarted : null;
}

export function wavePreview(stage: Stage, index: number): PreviewEntry[] {
  const wave = stage.waves[index];
  if (!wave) return [];
  const out: PreviewEntry[] = [];
  for (const group of wave.groups) {
    const kind = ENEMIES[group.enemyId];
    const count = group.count * kind.swarm;
    const found = out.find((e) => e.enemyId === group.enemyId);
    if (found) found.count += count;
    else out.push({ enemyId: group.enemyId, count, air: kind.air });
  }
  return out;
}

export type MatchHint = 'good' | 'neutral' | 'bad';

/**
 * 타워 단계가 다음 웨이브에 맞는지 — 못 때리는 적(공중)이 있으면 ▼, 그 피해 타입 저항이 HP 가중 평균 40% 이상이면 ▼, 10% 이하면 ▲
 * 미리보기 힌트일 뿐 판정에 쓰지 않는다(부동소수 허용)
 */
export function matchHint(stage: Stage, index: number, towerStage: TowerStage, damageType: number): MatchHint {
  const wave = stage.waves[index];
  if (!wave) return 'neutral';
  let hp = 0;
  let resist = 0;
  let unreachable = false;
  for (const group of wave.groups) {
    const kind = ENEMIES[group.enemyId];
    if (kind.air ? !towerStage.hitsAir : !towerStage.hitsGround) unreachable = true;
    const total = group.hp * group.count * kind.swarm;
    hp += total;
    resist += total * (damageType === DAMAGE.PHY ? kind.resistPhy : damageType === DAMAGE.MAG ? kind.resistMag : 0);
  }
  if (unreachable) return 'bad';
  const average = hp > 0 ? resist / hp : 0;
  if (average >= 400) return 'bad';
  return average <= 100 ? 'good' : 'neutral';
}
