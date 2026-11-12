import { describe, it, expect } from 'vitest';
import { MAX_TICKS_PER_TURN, MOVE_PX_PER_TICK } from './constants';
import { WEAPONS } from './data';
import { type Action, applyAction } from './game';
import { type MatchEvent, eventsEndTick, runFire, settle, walk } from './sim';
import { type MatchConfig, type MatchState, type Tank, createMatch } from './state';
import { groundAt } from './terrain';
import golden from './__fixtures__/golden-matches.json';

type GoldenCase = { name: string; config: MatchConfig; actions: Action[]; expected: { ok: boolean } };
const cases = golden as unknown as GoldenCase[];

/** 골든 경기의 행동마다 events — 실패 케이스는 적용된 데까지 */
function goldenEvents(): MatchEvent[][] {
  const out: MatchEvent[][] = [];
  for (const c of cases) {
    const created = createMatch(c.config);
    if (!created.ok) continue;
    let state = created.state;
    for (const action of c.actions) {
      const r = applyAction(state, action);
      if (!r.ok) break;
      out.push(r.events);
      state = r.state;
    }
  }
  return out;
}

/** §11 규칙을 그대로 옮긴 수동 계산 — shot 끝 = 시작 + 샘플 수 − 1, move = 걸음 수 / MOVE_PX_PER_TICK 올림, 나머지 = t */
function manualEndTick(events: MatchEvent[]): number {
  let end = 0;
  for (const e of events) {
    if (e.type === 'shot') end = Math.max(end, e.t + e.samples.length / 2 - 1);
    else if (e.type === 'move') end = Math.max(end, Math.ceil((e.path.length / 2 - 1) / MOVE_PX_PER_TICK));
    else end = Math.max(end, e.t);
  }
  return end;
}

/** applyAction과 같은 순서(walk → runFire → settle)로 엔진 내부 마지막 틱을 직접 얻는다 — eventsEndTick의 독립 기준 */
function engineTick(state: MatchState, move: number, angle: number, power: number, weaponId: number, startTick = 0) {
  const tanks = state.tanks.filter((t): t is Tank => t !== null).map((t) => ({ ...t }));
  const shooter = tanks.find((t) => t.slot === state.turn.slot) as Tank;
  const events: MatchEvent[] = [];
  let tick = walk(state.terrain, shooter, move, events) + startTick;
  if (shooter.alive) tick = runFire(state.terrain, tanks, events, shooter, angle, power, WEAPONS[weaponId], state.wind, tick, false).tick;
  settle(state.terrain, tanks, events, tick);
  return { tick, events, fellWalking: !shooter.alive && events.some((e) => e.type === 'death' && e.slot === shooter.slot && e.cause === 'out') };
}

function start(mapId: 'hills' | 'canyon', seed: number): MatchState {
  const created = createMatch({ seed, mapId, mode: 'ffa', players: [0, 1, 2].map((slot) => ({ slot, team: 0, tankId: slot })) });
  if (!created.ok) throw new Error(created.reason);
  return created.state;
}

describe('eventsEndTick', () => {
  const all = goldenEvents();

  it('골든 경기 모든 행동에서 수동 계산과 같다', () => {
    expect(all.length).toBeGreaterThan(100);
    for (const events of all) expect(eventsEndTick(events)).toBe(manualEndTick(events));
  });

  it('엔진 틱과 맞물린다 — 폭발로 끝난 탄의 끝 틱에 explode가 있고, 낙하 정착은 마지막 틱에 일어난다', () => {
    let falls = 0;
    for (const events of all) {
      const end = eventsEndTick(events);
      for (const e of events) {
        if (e.type === 'shot' && e.end === 'explode') {
          const last = e.t + e.samples.length / 2 - 1;
          expect(events.some((x) => x.type === 'explode' && x.t === last)).toBe(true);
        }
        // settle은 모든 탄이 끝난 틱에 한 번 — 이동 중 추락사(walk)는 탄이 없을 때만
        if (e.type === 'fall' && events.some((x) => x.type === 'shot')) {
          falls++;
          expect(e.t).toBe(end);
        }
      }
    }
    expect(falls).toBeGreaterThan(0);
  });

  it('엔진 내부 틱(walk·runFire·settle)과 같다 — 이동 3의 배수 아님·무기 6종·이동만', () => {
    let checked = 0;
    for (const mapId of ['hills', 'canyon'] as const) {
      for (const seed of [3, 11]) {
        const state = start(mapId, seed);
        for (const weaponId of [0, 1, 2, 3, 4, 5]) {
          for (const angle of [20, 55, 89, 125, 160]) {
            for (const power of [0, 35, 100]) {
              for (const move of [0, -31, 47]) {
                const r = engineTick(state, move, angle, power, weaponId);
                if (r.fellWalking) continue;
                expect(eventsEndTick(r.events)).toBe(r.tick);
                checked++;
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('이동 중 협곡 추락사 — 걸음 수가 3의 배수가 아니면 연출 기준으로 엔진 틱보다 1 크다(그 밖엔 같다)', () => {
    const state = start('canyon', 1);
    const tank = state.tanks[state.turn.slot] as Tank;
    let off = 0;
    let exact = 0;
    for (let x = 400; x < 1650; x += 7) {
      const y = groundAt(state.terrain.cols[x], 0);
      if (y < 0) continue;
      const placed: MatchState = { ...state, tanks: state.tanks.map((t) => (t && t.slot === tank.slot ? { ...t, x, y, fuel: 160 } : t)) };
      for (const move of [-160, 160]) {
        const r = engineTick(placed, move, 90, 0, 0);
        if (!r.fellWalking) continue;
        const moveEvent = r.events.find((e) => e.type === 'move');
        const steps = moveEvent && moveEvent.type === 'move' ? moveEvent.path.length / 2 - 1 : 0;
        const diff = eventsEndTick(r.events) - r.tick;
        expect(diff).toBe(steps % MOVE_PX_PER_TICK === 0 ? 0 : 1);
        if (diff === 1) off++;
        else exact++;
      }
    }
    expect(off).toBeGreaterThan(0);
    expect(exact).toBeGreaterThan(0);
  });

  it('턴 틱 상한(timeout)으로 끝난 탄도 엔진 틱과 같다', () => {
    const state = start('hills', 2);
    const r = engineTick(state, 0, 80, 100, 0, MAX_TICKS_PER_TURN - 5);
    expect(r.events.some((e) => e.type === 'shot' && e.end === 'timeout')).toBe(true);
    expect(r.tick).toBe(MAX_TICKS_PER_TURN);
    expect(eventsEndTick(r.events)).toBe(MAX_TICKS_PER_TURN);
  });

  it('이벤트가 없으면 0 (파워 0 + 이동 0)', () => {
    expect(eventsEndTick([])).toBe(0);
    const created = createMatch(cases.find((c) => c.expected.ok)!.config);
    if (!created.ok) throw new Error(created.reason);
    const r = applyAction(created.state, { kind: 'fire', move: 0, angle: 90, power: 0, weaponId: 0 });
    if (!r.ok) throw new Error(r.reason);
    expect(r.events).toEqual([]);
    expect(eventsEndTick(r.events)).toBe(0);
  });
});
