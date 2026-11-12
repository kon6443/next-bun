/**
 * 골든 경기 케이스 (fortress §10) — 실제 플레이(AI·각본)로 행동 목록을 만들고 simulateMatch 결과를 기대값으로 둔다
 * 결과 파일: ../engine/__fixtures__/golden-matches.json (백엔드 사본과 바이트 단위로 같은 파일)
 * 기대값: 성공이면 { ok, hashes(행동마다 stateHash), result }, 실패면 { ok:false, reason, at }
 */

import {
  type Action,
  CONFIG_REASON,
  type MatchConfig,
  type MatchResult,
  type MatchState,
  REASON,
  TANKS,
  WEAPONS,
  applyAction,
  createMatch,
  fnv1a,
  simulateMatch,
} from '../engine';
import { type AiLevel, chooseTurn } from '../ai/chooseTurn';

export type GoldenExpected = { ok: true; hashes: string[]; result: MatchResult } | { ok: false; reason: string; at: number };
export type GoldenCase = { name: string; config: MatchConfig; actions: Action[]; expected: GoldenExpected };

export function expectedOf(config: MatchConfig, actions: readonly Action[]): GoldenExpected {
  const r = simulateMatch(config, actions);
  return r.ok ? { ok: true, hashes: r.hashes, result: r.final.result } : { ok: false, reason: r.reason, at: r.at };
}

function start(config: MatchConfig): MatchState {
  const created = createMatch(config);
  if (!created.ok) throw new Error(`골든 설정 오류: ${created.reason}`);
  return created.state;
}

function apply(state: MatchState, action: Action): MatchState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`골든 행동 거부: ${r.reason} ${JSON.stringify(action)}`);
  return r.state;
}

/** slot별 AI 레벨로 끝까지(또는 maxActions까지) — AI seed = FNV-1a(경기 seed, 턴 수) */
export function playAi(config: MatchConfig, levels: readonly AiLevel[], maxActions = 400): Action[] {
  let state = start(config);
  const actions: Action[] = [];
  while (state.result.kind === 'ongoing' && actions.length < maxActions) {
    const slot = state.turn.slot;
    const action = chooseTurn(state, slot, levels[slot], fnv1a([config.seed, state.turn.no]));
    actions.push(action);
    state = apply(state, action);
  }
  return actions;
}

const ffa = (seed: number, mapId: MatchConfig['mapId'], tankIds: number[]): MatchConfig => ({
  seed,
  mapId,
  mode: 'ffa',
  players: tankIds.map((tankId, slot) => ({ slot, team: 0, tankId })),
});

const team = (seed: number, mapId: MatchConfig['mapId']): MatchConfig => ({
  seed,
  mapId,
  mode: 'team',
  players: [
    { slot: 0, team: 0, tankId: 0 },
    { slot: 1, team: 1, tankId: 1 },
    { slot: 2, team: 0, tankId: 2 },
    { slot: 3, team: 1, tankId: 0 },
  ],
});

const hold = (move = 0): Action => ({ kind: 'fire', move, angle: 90, power: 0, weaponId: 0 });

/** 협곡에 걸어 들어가 즉사하는 seed·이동 — 가운데 탱크가 연료 안에서 협곡에 닿는 첫 seed */
function findFallDeath(): { config: MatchConfig; actions: Action[] } {
  for (let seed = 1; seed < 500; seed++) {
    const config = ffa(seed, 'canyon', [2, 2, 2]);
    const state = start(config);
    const me = state.tanks[state.turn.slot];
    if (!me) continue;
    const fuel = TANKS[me.tankId].fuel;
    for (const move of [-fuel, fuel]) {
      const r = applyAction(state, hold(move));
      if (r.ok && r.events.some((e) => e.type === 'death' && e.cause === 'out')) return { config, actions: [hold(move)] };
    }
  }
  throw new Error('협곡 즉사 seed를 못 찾음');
}

/** 무기마다 한 번씩 쏘는 각본 — 탱크 3종 × 무기 3개, 쿨다운이 걸리면 기본 무기 */
function allWeapons(): { config: MatchConfig; actions: Action[] } {
  const config = ffa(77, 'hills', [0, 1, 2]);
  let state = start(config);
  const actions: Action[] = [];
  const used: boolean[] = WEAPONS.map(() => false);
  for (let i = 0; i < 9 && state.result.kind === 'ongoing'; i++) {
    const me = state.tanks[state.turn.slot];
    if (!me) break;
    const owned = TANKS[me.tankId].weapons;
    const weaponId = owned.find((w) => !used[w]) ?? owned[0];
    used[weaponId] = true;
    const ai = chooseTurn(state, me.slot, 1, fnv1a([config.seed, state.turn.no]));
    const action: Action = ai.kind === 'fire' ? { ...ai, weaponId } : ai;
    const r = applyAction(state, action);
    const final = r.ok ? action : { ...action, weaponId: owned[0] };
    actions.push(final);
    state = apply(state, final);
  }
  return { config, actions };
}

export function buildGoldenCases(): GoldenCase[] {
  const cases: GoldenCase[] = [];
  const add = (name: string, config: MatchConfig, actions: Action[]) => cases.push({ name, config, actions, expected: expectedOf(config, actions) });

  // ===== 성공 경기 =====
  add('ffa 2인 hills AI 중·중', ffa(1, 'hills', [0, 1]), playAi(ffa(1, 'hills', [0, 1]), [1, 1]));
  add('ffa 2인 canyon AI 하·상', ffa(2, 'canyon', [2, 0]), playAi(ffa(2, 'canyon', [2, 0]), [0, 2]));
  add('ffa 3인 hills AI 하·중·상', ffa(3, 'hills', [1, 2, 0]), playAi(ffa(3, 'hills', [1, 2, 0]), [0, 1, 2]));
  add('ffa 4인 canyon AI 혼합', ffa(4, 'canyon', [0, 1, 2, 1]), playAi(ffa(4, 'canyon', [0, 1, 2, 1]), [1, 0, 2, 1]));
  add('team 2:2 hills AI', team(5, 'hills'), playAi(team(5, 'hills'), [1, 1, 1, 1]));
  add('team 2:2 canyon AI 상·하', team(6, 'canyon'), playAi(team(6, 'canyon'), [2, 0, 2, 0]));
  const weapons = allWeapons();
  add('무기 6종 각 1회', weapons.config, weapons.actions);

  // 스킵 3연속 탈락 — 첫 턴 플레이어가 3번 스킵, 상대는 파워 0
  const skipConfig = ffa(8, 'hills', [0, 1]);
  add('스킵 3회 탈락', skipConfig, [{ kind: 'skip' }, hold(), { kind: 'skip' }, hold(), { kind: 'skip' }]);

  const fall = findFallDeath();
  add('협곡 낙하 즉사', fall.config, fall.actions);

  // 턴 상한 — 아무도 안 쏘면 HP 비교: 같은 탱크면 무승부, 다른 탱크면 HP 큰 쪽 승
  const capDraw = ffa(9, 'hills', [1, 1]);
  add('턴 상한 무승부', capDraw, Array.from({ length: 60 }, () => hold()));
  const capWin = ffa(10, 'hills', [0, 2]);
  add('턴 상한 HP 판정 승', capWin, Array.from({ length: 60 }, () => hold()));

  // 기권 — 남의 턴 기권(턴 유지) → 현재 턴 기권(턴 넘김) → 1명 남아 승리
  const resignConfig = ffa(11, 'hills', [0, 1, 2]);
  {
    const s = start(resignConfig);
    const current = s.turn.slot;
    const other = [0, 1, 2].find((x) => x !== current) as number;
    add('기권 남의 턴·현재 턴', resignConfig, [{ kind: 'resign', slot: other }, { kind: 'resign', slot: current }]);
  }

  // ===== 실패 사유 =====
  const base = ffa(12, 'hills', [0, 1]);
  const baseState = start(base);
  const me = baseState.tanks[baseState.turn.slot];
  const fuel = me ? TANKS[me.tankId].fuel : 0;
  const special = me ? TANKS[me.tankId].weapons[2] : 0;
  const fire = (o: Partial<{ move: number; angle: number; power: number; weaponId: number }>): Action => ({ kind: 'fire', move: 0, angle: 45, power: 50, weaponId: 0, ...o });
  add('실패 MOVE_RANGE', base, [fire({ move: fuel + 1 })]);
  add('실패 ANGLE_RANGE', base, [fire({ angle: 181 })]);
  add('실패 POWER_RANGE', base, [fire({ power: -1 })]);
  add('실패 WEAPON_UNKNOWN', base, [fire({ weaponId: 99 })]);
  // 필살기 → 상대 파워 0 → 다시 필살기
  add('실패 WEAPON_COOLDOWN', base, [fire({ weaponId: special }), hold(), fire({ weaponId: special })]);
  add('실패 BAD_KIND', base, [{ kind: 'pass' } as unknown as Action]);
  add('실패 SLOT_NOT_ALIVE', base, [{ kind: 'resign', slot: 3 }]);
  add('실패 NOT_RUNNING', skipConfig, [{ kind: 'skip' }, hold(), { kind: 'skip' }, hold(), { kind: 'skip' }, hold()]);
  add('실패 설정 BAD_TEAMS', { ...team(13, 'hills'), players: team(13, 'hills').players.slice(0, 3) }, []);

  const reasons = new Set(cases.filter((c) => !c.expected.ok).map((c) => (c.expected as { reason: string }).reason));
  for (const reason of [...Object.values(REASON), CONFIG_REASON.BAD_TEAMS]) {
    if (!reasons.has(reason)) throw new Error(`골든에 실패 사유 ${reason} 없음`);
  }
  return cases;
}

/** JSON 2칸 들여쓰기 + 끝 LF — 백엔드 사본과 바이트 단위로 같아야 한다 */
export function formatGoldenJson(cases: readonly GoldenCase[]): string {
  return `${JSON.stringify(cases, null, 2)}\n`;
}
