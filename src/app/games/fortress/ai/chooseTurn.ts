/**
 * 포트리스 AI — 시뮬레이션 탐색 (fortress DESIGN §2-1, §10)
 * 후보(각도 × 파워 × 무기 [× 이동])를 엔진 previewShot으로 미리 쏴 보고 "적 피해 − 아군 피해"가 큰 발을 고른 뒤 seed 오차를 더한다
 * - 하(0): 성긴 격자·기본 무기 하나·큰 오차 · 중(1): 촘촘한 격자·기본 무기 둘·필살기, 상위 3발 applyAction 검증 · 상(2): 성긴 탐색 → 상위 후보 정밀 탐색 → 이동 → applyAction 검증, 작은 오차(하한 1)
 * 엔진과 같은 순수성 규칙(ESLint·tokenScan) — 백엔드 사본·매니페스트 대상은 아니다(싱글 랭킹 Q3 때 재결정)
 */

import {
  ANGLE_MAX,
  POWER_MAX,
  TANKS,
  WEAPONS,
  type Action,
  type FireInput,
  type MatchState,
  type Tank,
  applyAction,
  fnv1a,
  isqrt,
  nextRandom,
  previewShot,
} from '../engine';

export type AiLevel = 0 | 1 | 2;

type Candidate = { input: FireInput; score: number };

/**
 * 레벨별 탐색 격자·오차(파워 오차는 칸) — v2 엔진(가까운 2인 간격·약한 바람)에서 처음 5발 발당 명중률이 v1과 비슷하게(하 약 6% · 중 24% · 상 54%, D-023 측정)
 * v1 값은 8 · 4 · 1 — 그대로 두면 v2에서 17% · 43% · 67%(상은 첫 명중 평균 1.18발)로 세졌다
 */
const LEVELS = [
  { angleStep: 10, powerStep: 10, powerMin: 30, weapons: 1, special: false, angleError: 6, powerError: 16 },
  { angleStep: 5, powerStep: 5, powerMin: 20, weapons: 2, special: true, angleError: 3, powerError: 9 },
  { angleStep: 6, powerStep: 6, powerMin: 16, weapons: 2, special: true, angleError: 1, powerError: 3 },
] as const;

const KILL_BONUS = 40;
const FRIENDLY_WEIGHT = 2;
const MISS_SCORE = -100000;

function enemiesOf(state: MatchState, me: Tank): Tank[] {
  return state.tanks.filter((t): t is Tank => t !== null && t.alive && t.team !== me.team);
}

/** 예상 피해로 점수 — 맞힌 게 없으면 착탄점이 가장 가까운 적에게서 먼 만큼 감점 */
function scorePreview(state: MatchState, me: Tank, input: FireInput): number {
  const p = previewShot(state, input);
  if (!p.ok || !p.from.alive) return MISS_SCORE * 2;
  if (!p.impact) return MISS_SCORE;
  let score = 0;
  let hit = false;
  for (const t of state.tanks) {
    if (!t || !t.alive) continue;
    const dmg = Math.min(p.damage[t.slot], t.hp);
    if (dmg <= 0) continue;
    if (t.team === me.team) score -= dmg * FRIENDLY_WEIGHT + (dmg >= t.hp ? KILL_BONUS * 4 : 0);
    else {
      score += dmg + (dmg >= t.hp ? KILL_BONUS : 0);
      hit = true;
    }
  }
  if (hit) return score;
  let nearest = MISS_SCORE;
  for (const e of enemiesOf(state, me)) {
    const dx = e.x - p.impact.x;
    const dy = e.y - p.impact.y;
    nearest = Math.max(nearest, -isqrt(dx * dx + dy * dy));
  }
  return score + Math.floor(nearest / 4);
}

/** applyAction 결과로 점수 — 낙하·연쇄까지 정확 (상급 최종 검증) */
function scoreApplied(state: MatchState, me: Tank, input: FireInput): number {
  const r = applyAction(state, input);
  if (!r.ok) return MISS_SCORE * 2;
  let score = 0;
  for (const t of state.tanks) {
    if (!t || !t.alive) continue;
    const after = r.state.tanks[t.slot] as Tank;
    const lost = t.hp - after.hp;
    if (t.team === me.team) score -= lost * FRIENDLY_WEIGHT + (after.alive ? 0 : KILL_BONUS * 4);
    else score += lost + (after.alive ? 0 : KILL_BONUS);
  }
  return score;
}

/** 격자 탐색에 쓸 무기 — 기본 무기 + 필살기 중 일반 탄(shell). 분열·폭격은 첫 폭발만 보는 previewShot으로 평가가 안 돼 따로(appliedSpecials) */
function weaponChoices(me: Tank, level: (typeof LEVELS)[number]): number[] {
  const own = TANKS[me.tankId].weapons;
  const list = own.slice(0, level.weapons);
  const special = WEAPONS[own[2]];
  if (level.special && me.cooldown === 0 && special.kind === 'shell') list.push(special.id);
  return list;
}

/** 분열·폭격 필살기 — 상위 후보와 같은 조준으로 applyAction 결과를 본다 */
function appliedSpecials(state: MatchState, me: Tank, level: (typeof LEVELS)[number], seeds: Candidate[]): Candidate[] {
  const special = WEAPONS[TANKS[me.tankId].weapons[2]];
  if (!level.special || me.cooldown > 0 || special.kind === 'shell') return [];
  return seeds.map((c) => {
    const input: FireInput = { ...c.input, weaponId: special.id };
    return { input, score: scoreApplied(state, me, input) };
  });
}

/** 각도 범위 — 하·중은 가장 가까운 적 쪽 반원, 상은 양쪽 */
function angleRange(state: MatchState, me: Tank, both: boolean): [number, number][] {
  if (both) return [[6, ANGLE_MAX - 6]];
  let nearest: Tank | null = null;
  for (const e of enemiesOf(state, me)) {
    if (!nearest || Math.abs(e.x - me.x) < Math.abs(nearest.x - me.x)) nearest = e;
  }
  return nearest && nearest.x < me.x ? [[95, 170]] : [[10, 85]];
}

function grid(
  state: MatchState,
  me: Tank,
  move: number,
  weapons: number[],
  ranges: [number, number][],
  angleStep: number,
  powerMin: number,
  powerStep: number,
): Candidate[] {
  const out: Candidate[] = [];
  for (const weaponId of weapons) {
    for (const [lo, hi] of ranges) {
      for (let angle = lo; angle <= hi; angle += angleStep) {
        for (let power = powerMin; power <= POWER_MAX; power += powerStep) {
          const input: FireInput = { kind: 'fire', move, angle, power, weaponId };
          out.push({ input, score: scorePreview(state, me, input) });
        }
      }
    }
  }
  return out;
}

/** 점수 내림차순, 같으면 먼저 만든 후보 — 정렬 기준이 결정적이다 */
function best(list: Candidate[], n: number): Candidate[] {
  return list
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.score - a.c.score || a.i - b.i)
    .slice(0, n)
    .map((x) => x.c);
}

function refine(state: MatchState, me: Tank, seed: Candidate, radius: number): Candidate[] {
  const out: Candidate[] = [];
  const { move, angle, power, weaponId } = seed.input;
  for (let a = Math.max(0, angle - radius); a <= Math.min(ANGLE_MAX, angle + radius); a++) {
    for (let p = Math.max(1, power - radius); p <= Math.min(POWER_MAX, power + radius); p++) {
      const input: FireInput = { kind: 'fire', move, angle: a, power: p, weaponId };
      out.push({ input, score: scorePreview(state, me, input) });
    }
  }
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** seed 오차 — [−e, +e] 정수 */
function jitter(rng: number, e: number): [number, number] {
  const [next, value] = nextRandom(rng);
  return [next, (value % (e * 2 + 1)) - e];
}

/** 현재 턴 slot의 행동 — 내 턴이 아니거나 경기가 끝났으면 skip */
export function chooseTurn(state: MatchState, slot: number, level: AiLevel, seed: number): Action {
  const me = state.tanks[slot];
  if (state.result.kind !== 'ongoing' || state.turn.slot !== slot || !me || !me.alive) return { kind: 'skip' };
  const cfg = LEVELS[level];
  const weapons = weaponChoices(me, cfg);
  let pick: Candidate;

  if (level === 0) {
    pick = best(grid(state, me, 0, weapons, angleRange(state, me, false), cfg.angleStep, cfg.powerMin, cfg.powerStep), 1)[0];
  } else if (level === 1) {
    const top = best(grid(state, me, 0, weapons, angleRange(state, me, false), cfg.angleStep, cfg.powerMin, cfg.powerStep), 3);
    const applied = top.map((c) => ({ input: c.input, score: scoreApplied(state, me, c.input) }));
    pick = best([...applied, ...appliedSpecials(state, me, cfg, top)], 1)[0];
  } else {
    const coarse = best(grid(state, me, 0, weapons, angleRange(state, me, true), cfg.angleStep, cfg.powerMin, cfg.powerStep), 3);
    let fine = best(coarse.flatMap((c) => refine(state, me, c, 3)), 3);
    // 못 맞히면 이동 후보(연료 절반 좌·우)도 본다
    if (fine[0].score <= 0) {
      const half = Math.floor(me.fuel / 2);
      for (const move of [-half, half]) {
        if (move === 0) continue;
        const moved = best(grid(state, me, move, weapons, angleRange(state, me, true), cfg.angleStep * 2, cfg.powerMin, cfg.powerStep * 2), 1);
        fine = best([...fine, ...best(moved.flatMap((c) => refine(state, me, c, 2)), 1)], 3);
      }
    }
    const applied = fine.map((c) => ({ input: c.input, score: scoreApplied(state, me, c.input) }));
    pick = best([...applied, ...appliedSpecials(state, me, cfg, fine)], 1)[0];
  }

  const [rng, da] = jitter(fnv1a([seed, state.turn.no, slot, level]), cfg.angleError);
  const [, dp] = jitter(rng, cfg.powerError);
  return {
    ...pick.input,
    angle: clamp(pick.input.angle + da, 0, ANGLE_MAX),
    power: clamp(pick.input.power + dp, 1, POWER_MAX),
  };
}
