import { describe, it, expect } from 'vitest';
import { MAX_ROUNDS, MAX_SKIPS, REASON, WORLD_HEIGHT } from './constants';
import { TANKS, WEAPONS } from './data';
import { type Action, type FireInput, applyAction, previewShot } from './game';
import { stateHash } from './hash';
import { type MatchConfig, type MatchState, type Tank, createMatch, nextSlot } from './state';

const ffa = (seed: number, tankIds: number[], mapId: MatchConfig['mapId'] = 'hills'): MatchConfig => ({
  seed,
  mapId,
  mode: 'ffa',
  players: tankIds.map((tankId, slot) => ({ slot, team: 0, tankId })),
});
const team: MatchConfig = {
  seed: 3,
  mapId: 'hills',
  mode: 'team',
  players: [
    { slot: 0, team: 0, tankId: 0 },
    { slot: 1, team: 0, tankId: 1 },
    { slot: 2, team: 1, tankId: 2 },
    { slot: 3, team: 1, tankId: 0 },
  ],
};

function start(config: MatchConfig): MatchState {
  const r = createMatch(config);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

function run(state: MatchState, action: Action): MatchState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

const hold: FireInput = { kind: 'fire', move: 0, angle: 90, power: 0, weaponId: 0 };

/** 중첩 객체·배열을 모두 얼린다 — 엔진이 입력 state를 바꾸면 strict 모드에서 throw */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

describe('createMatch', () => {
  it('설정 검증 — 인원·slot 중복·팀 2:2·탱크·맵·seed', () => {
    expect(createMatch({ ...ffa(1, [0]) })).toEqual({ ok: false, reason: 'BAD_PLAYERS' });
    expect(createMatch({ ...ffa(1, [0, 1]), players: [{ slot: 0, team: 0, tankId: 0 }, { slot: 0, team: 0, tankId: 1 }] })).toEqual({ ok: false, reason: 'BAD_PLAYERS' });
    expect(createMatch({ ...team, players: team.players.map((p) => ({ ...p, team: 0 })) })).toEqual({ ok: false, reason: 'BAD_TEAMS' });
    expect(createMatch(ffa(1, [0, 9]))).toEqual({ ok: false, reason: 'BAD_TANK' });
    expect(createMatch({ ...ffa(1, [0, 1]), mapId: 'moon' as 'hills' })).toEqual({ ok: false, reason: 'BAD_MAP' });
    expect(createMatch({ ...ffa(1, [0, 1]), seed: -1 })).toEqual({ ok: false, reason: 'BAD_SEED' });
    expect(createMatch({ ...ffa(1, [0, 1]), mode: 'duo' as 'ffa' })).toEqual({ ok: false, reason: 'BAD_MODE' });
  });

  it('같은 설정이면 같은 state·해시, 스폰은 땅 위', () => {
    for (const mapId of ['hills', 'canyon'] as const) {
      const a = start(ffa(42, [0, 1, 2, 0], mapId));
      expect(stateHash(a)).toBe(stateHash(start(ffa(42, [0, 1, 2, 0], mapId))));
      for (const t of a.tanks) {
        expect(t).not.toBeNull();
        const col = a.terrain.cols[(t as Tank).x];
        expect(col).toContain((t as Tank).y);
      }
    }
  });

  it('team 모드는 A·B가 번갈아 선다', () => {
    const s = start(team);
    const byX = (s.tanks as Tank[]).slice().sort((a, b) => a.x - b.x).map((t) => t.team);
    expect([byX[0] !== byX[1], byX[1] !== byX[2], byX[2] !== byX[3]]).toEqual([true, true, true]);
  });
});

describe('applyAction', () => {
  it('입력 state를 바꾸지 않는다 (얼려도 throw 없음)', () => {
    let s = deepFreeze(start(ffa(5, [0, 1, 2])));
    const before = JSON.stringify(s);
    const r = applyAction(s, { kind: 'fire', move: 20, angle: 60, power: 70, weaponId: 0 });
    expect(r.ok).toBe(true);
    expect(JSON.stringify(s)).toBe(before);
    s = deepFreeze((r as { state: MatchState }).state);
    expect(applyAction(s, { kind: 'skip' }).ok).toBe(true);
    expect(applyAction(s, { kind: 'resign', slot: 0 }).ok).toBe(true);
  });

  it('지형은 바뀐 열만 새 배열(구조 공유)', () => {
    const s = start(ffa(5, [0, 1]));
    // 땅에 닿는 첫 발
    let r = applyAction(s, hold);
    for (let power = 20; power <= 100 && !(r.ok && r.events.some((e) => e.type === 'terrain')); power += 10) {
      r = applyAction(s, { kind: 'fire', move: 0, angle: 60, power, weaponId: 0 });
    }
    if (!r.ok) throw new Error(r.reason);
    const terrainEvent = r.events.find((e) => e.type === 'terrain');
    if (!terrainEvent || terrainEvent.type !== 'terrain') throw new Error('지형 변화 없음');
    let shared = 0;
    for (let x = 0; x < s.terrain.cols.length; x++) {
      if (r.state.terrain.cols[x] === s.terrain.cols[x]) shared++;
      else expect(x >= terrainEvent.x0 && x <= terrainEvent.x1).toBe(true);
    }
    expect(shared).toBeGreaterThan(s.terrain.cols.length - 300);
  });

  it('검증 실패 사유', () => {
    const s = start(ffa(6, [0, 1]));
    const me = s.tanks[s.turn.slot] as Tank;
    const fire = (o: Partial<FireInput>) => applyAction(s, { ...hold, power: 50, ...o });
    expect(fire({ move: TANKS[me.tankId].fuel + 1 })).toEqual({ ok: false, reason: REASON.MOVE_RANGE });
    expect(fire({ move: 1.5 })).toEqual({ ok: false, reason: REASON.MOVE_RANGE });
    expect(fire({ angle: -1 })).toEqual({ ok: false, reason: REASON.ANGLE_RANGE });
    expect(fire({ power: 101 })).toEqual({ ok: false, reason: REASON.POWER_RANGE });
    const notOwned = WEAPONS.find((w) => !TANKS[me.tankId].weapons.includes(w.id)) as (typeof WEAPONS)[number];
    expect(fire({ weaponId: notOwned.id })).toEqual({ ok: false, reason: REASON.WEAPON_UNKNOWN });
    expect(fire({ weaponId: 99 })).toEqual({ ok: false, reason: REASON.WEAPON_UNKNOWN });
    expect(applyAction(s, { kind: 'jump' } as unknown as Action)).toEqual({ ok: false, reason: REASON.BAD_KIND });
    expect(applyAction(s, null as unknown as Action)).toEqual({ ok: false, reason: REASON.BAD_KIND });
    expect(applyAction(s, { kind: 'resign', slot: 2 })).toEqual({ ok: false, reason: REASON.SLOT_NOT_ALIVE });
  });

  it('파워 0은 쏘지 않고 턴만 넘긴다 (자발적 패스 대신, D-008 C)', () => {
    const s = start(ffa(7, [0, 1]));
    const r = applyAction(s, hold);
    if (!r.ok) throw new Error(r.reason);
    expect(r.events.filter((e) => e.type === 'shot' || e.type === 'explode')).toEqual([]);
    expect(r.state.turn.slot).not.toBe(s.turn.slot);
    expect(r.state.terrain).toBe(s.terrain);
  });

  it('필살기 쿨다운 — 쓰고 나면 자기 턴 N회 동안 못 쓴다', () => {
    let s = start(ffa(8, [0, 0]));
    const first = s.turn.slot;
    const special = TANKS[0].weapons[2];
    const n = WEAPONS[special].cooldown;
    s = run(s, { kind: 'fire', move: 0, angle: 45, power: 40, weaponId: special });
    for (let i = 0; i < n; i++) {
      s = run(s, hold); // 상대
      expect(applyAction(s, { ...hold, power: 30, weaponId: special })).toEqual({ ok: false, reason: REASON.WEAPON_COOLDOWN });
      s = run(s, hold); // 내 턴 소모
    }
    s = run(s, hold);
    expect(s.turn.slot).toBe(first);
    expect(applyAction(s, { ...hold, power: 30, weaponId: special }).ok).toBe(true);
  });

  it(`스킵 ${MAX_SKIPS}연속이면 탈락, 사이에 발사하면 다시 0부터`, () => {
    let s = start(ffa(9, [0, 1, 2]));
    const me = s.turn.slot;
    const cycle = (a: Action) => {
      s = run(s, a);
      while (s.result.kind === 'ongoing' && s.turn.slot !== me) s = run(s, hold);
    };
    cycle({ kind: 'skip' });
    cycle({ kind: 'skip' });
    cycle(hold);
    expect((s.tanks[me] as Tank).skips).toBe(0);
    cycle({ kind: 'skip' });
    cycle({ kind: 'skip' });
    const r = applyAction(s, { kind: 'skip' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.events).toContainEqual({ type: 'death', t: 0, slot: me, cause: 'skips' });
    expect((r.state.tanks[me] as Tank).alive).toBe(false);
  });

  it('남의 턴 기권은 턴을 유지하고, 현재 턴 기권은 턴을 넘긴다', () => {
    const s = start(ffa(10, [0, 1, 2]));
    const other = [0, 1, 2].find((x) => x !== s.turn.slot) as number;
    const a = run(s, { kind: 'resign', slot: other });
    expect(a.turn).toEqual(s.turn);
    expect(a.wind).toBe(s.wind);
    const b = run(a, { kind: 'resign', slot: a.turn.slot });
    expect(b.result).toEqual({ kind: 'win', slots: [[0, 1, 2].find((x) => x !== other && x !== s.turn.slot)] });
    expect(applyAction(b, hold)).toEqual({ ok: false, reason: REASON.NOT_RUNNING });
  });

  it(`턴 상한(${MAX_ROUNDS}라운드 × 인원) — HP 합이 같으면 무승부`, () => {
    let s = start(ffa(11, [1, 1, 1]));
    for (let i = 0; i < MAX_ROUNDS * 3; i++) s = run(s, hold);
    expect(s.result).toEqual({ kind: 'draw' });
    expect(s.turn.round).toBe(MAX_ROUNDS);
  });

  it('team 턴 상한 — 생존 팀원 HP 합이 큰 팀 승', () => {
    let s = start(team);
    // 첫 턴에 파랑 팀(0) 한 명을 기권시켜 HP 합을 낮춘다 — 남은 팀원 HP만 센다
    const blueGone = (s.tanks.find((t) => t && t.team === 0 && t.slot !== s.turn.slot) as Tank).slot;
    s = run(s, { kind: 'resign', slot: blueGone });
    while (s.result.kind === 'ongoing') s = run(s, hold);
    expect(s.turn.no).toBe(s.maxTurns);
    expect(s.result).toEqual({ kind: 'win', team: 1, slots: [2, 3] });
  });

  it('협곡에 걸어 들어가면 바닥 밖 즉사', () => {
    for (let seed = 1; seed < 300; seed++) {
      const s = start(ffa(seed, [2, 2, 2], 'canyon'));
      const fuel = TANKS[2].fuel;
      for (const move of [-fuel, fuel]) {
        const r = applyAction(s, { ...hold, move });
        if (!r.ok || !r.events.some((e) => e.type === 'death' && e.cause === 'out')) continue;
        const me = r.state.tanks[s.turn.slot] as Tank;
        expect(me.alive).toBe(false);
        expect(me.y).toBe(WORLD_HEIGHT);
        return;
      }
    }
    throw new Error('즉사 케이스 없음');
  });
});

describe('무기 규칙', () => {
  it('분열탄이 최고점 전에 닿으면 자탄 하나 크기로 터진다 (반지름 0 폭발 없음)', () => {
    const split = WEAPONS.find((w) => w.kind === 'split') as (typeof WEAPONS)[number];
    let early = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = start(ffa(seed, [1, 1]));
      for (const angle of [0, 15, 165, 180]) {
        for (const power of [20, 40, 60]) {
          const r = applyAction(s, { kind: 'fire', move: 0, angle, power, weaponId: split.id });
          if (!r.ok) throw new Error(r.reason);
          for (const e of r.events) if (e.type === 'explode') expect(e.r).toBeGreaterThan(0);
          const first = r.events.find((e) => e.type === 'shot');
          if (first && first.type === 'shot' && first.end === 'explode') {
            early++;
            expect(r.events.find((e) => e.type === 'explode')).toMatchObject({ r: split.radius });
          }
        }
      }
    }
    expect(early).toBeGreaterThan(0);
  });

  it('damage 이벤트는 실제로 깎인 HP — 남은 HP를 넘지 않는다', () => {
    let overkill = 0;
    for (let seed = 1; seed <= 30 && overkill === 0; seed++) {
      const s = start(ffa(seed, [0, 2]));
      const weak = s.tanks.map((t) => (t ? { ...t, hp: 3 } : t));
      const state = { ...s, tanks: weak };
      for (let angle = 10; angle <= 170 && overkill === 0; angle += 10) {
        const r = applyAction(state, { kind: 'fire', move: 0, angle, power: 60, weaponId: TANKS[(s.tanks[s.turn.slot] as Tank).tankId].weapons[1] });
        if (!r.ok) continue;
        for (const e of r.events) {
          if (e.type !== 'damage') continue;
          expect(e.amount).toBeLessThanOrEqual(3);
          overkill++;
        }
      }
    }
    expect(overkill).toBeGreaterThan(0);
  });
});

describe('턴 순서', () => {
  it('ffa — 생존 slot 오름차순 순환', () => {
    const s = start(ffa(12, [0, 1, 2, 0]));
    const tanks = s.tanks.map((t) => (t && t.slot === 2 ? { ...t, alive: false } : t));
    expect(nextSlot('ffa', tanks, 1, [-1, -1])).toBe(3);
    expect(nextSlot('ffa', tanks, 3, [-1, -1])).toBe(0);
  });

  it('team — A·B 교대, 팀 안 순환, 1명 남아도 교대 (A1 B1 A1 B2)', () => {
    let s = start(team);
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(s.turn.slot);
      s = run(s, hold);
    }
    const teamOf = (slot: number) => (s.tanks[slot] as Tank).team;
    expect(teamOf(seen[0])).not.toBe(teamOf(seen[1]));
    expect(teamOf(seen[0])).toBe(teamOf(seen[2]));
    expect(seen[0]).not.toBe(seen[2]);
    expect(seen[1]).not.toBe(seen[3]);
    // 시작 팀 한 명이 빠지면 남은 한 명이 매번 나온다
    const startTeam = teamOf(seen[0]);
    const lone = seen[0];
    const gone = [0, 1, 2, 3].find((x) => teamOf(x) === startTeam && x !== lone) as number;
    s = run(s, { kind: 'resign', slot: gone });
    const order: number[] = [];
    for (let i = 0; i < 4; i++) {
      order.push(s.turn.slot);
      s = run(s, hold);
    }
    expect(order.filter((x) => teamOf(x) === startTeam)).toEqual([lone, lone]);
    expect(new Set(order.filter((x) => teamOf(x) !== startTeam)).size).toBe(2);
  });
});

describe('previewShot', () => {
  it('첫 착탄점 = applyAction 첫 explode 위치·틱 (같은 탄도 코드), 아무것도 확정하지 않는다', () => {
    let checked = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = start(ffa(seed, [0, 1, 2], seed % 2 ? 'hills' : 'canyon'));
      const me = s.tanks[s.turn.slot] as Tank;
      for (const weaponId of TANKS[me.tankId].weapons) {
        for (const [angle, power, move] of [
          [30, 60, 0],
          [75, 85, 10],
          [120, 55, -15],
          [150, 95, 0],
        ]) {
          const input: FireInput = { kind: 'fire', move, angle, power, weaponId };
          const before = JSON.stringify(s);
          const p = previewShot(s, input);
          const r = applyAction(s, input);
          expect(JSON.stringify(s)).toBe(before);
          if (!p.ok || !r.ok) throw new Error('거부');
          const first = r.events.find((e) => e.type === 'explode');
          if (!first || first.type !== 'explode') {
            expect(p.impact).toBeNull();
            continue;
          }
          expect(p.impact).toEqual({ x: first.x, y: first.y, t: first.t });
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('첫 폭발 예상 피해 = 그 폭발 피해 이벤트 합', () => {
    const s = start(ffa(4, [0, 1]));
    const me = s.tanks[s.turn.slot] as Tank;
    const enemy = s.tanks.find((t) => t && t.slot !== me.slot) as Tank;
    // 적 바로 위에서 떨어뜨리는 대신: 여러 각도·파워 중 적에게 피해가 나는 첫 발
    for (let angle = 10; angle <= 170; angle += 5) {
      for (let power = 30; power <= 100; power += 5) {
        const input: FireInput = { kind: 'fire', move: 0, angle, power, weaponId: 0 };
        const p = previewShot(s, input);
        if (!p.ok || p.damage[enemy.slot] === 0) continue;
        const r = applyAction(s, input);
        if (!r.ok) throw new Error(r.reason);
        // 첫 폭발 바로 뒤 지형·피해·사망 이벤트까지가 그 폭발 몫(낙하 피해는 뒤에 따로 온다)
        let dealt = 0;
        for (let i = r.events.findIndex((e) => e.type === 'explode') + 1; i < r.events.length; i++) {
          const e = r.events[i];
          if (e.type === 'damage' && e.slot === enemy.slot) dealt += e.amount;
          else if (e.type !== 'terrain' && e.type !== 'damage' && e.type !== 'death') break;
        }
        expect(Math.min(p.damage[enemy.slot], enemy.hp)).toBe(dealt);
        return;
      }
    }
    throw new Error('적에게 닿는 발 없음');
  });
});
