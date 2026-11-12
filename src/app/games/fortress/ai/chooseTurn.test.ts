import { describe, it, expect } from 'vitest';
import { type MatchConfig, type MatchState, type Tank, applyAction, createMatch, fnv1a } from '../engine';
import { type AiLevel, chooseTurn } from './chooseTurn';

function start(config: MatchConfig): MatchState {
  const r = createMatch(config);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

const duel = (seed: number): MatchConfig => ({
  seed,
  mapId: seed % 2 ? 'hills' : 'canyon',
  mode: 'ffa',
  players: [
    { slot: 0, team: 0, tankId: 0 },
    { slot: 1, team: 0, tankId: 1 },
  ],
});

describe('chooseTurn', () => {
  it('같은 state·seed면 같은 행동, 엔진이 받아들이는 행동', () => {
    for (const level of [0, 1, 2] as AiLevel[]) {
      const s = start(duel(3));
      const a = chooseTurn(s, s.turn.slot, level, 7);
      expect(chooseTurn(s, s.turn.slot, level, 7)).toEqual(a);
      expect(applyAction(s, a).ok).toBe(true);
    }
  });

  it('여러 판·레벨에서 끝까지 — 매 턴 엔진이 받아들인다 (쿨다운·이동·팀 상태 포함)', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const config: MatchConfig =
        seed % 2
          ? duel(seed)
          : {
              seed,
              mapId: 'canyon',
              mode: 'team',
              players: [0, 1, 2, 3].map((slot) => ({ slot, team: slot < 2 ? 0 : 1, tankId: (slot + seed) % 3 })),
            };
      let s = start(config);
      for (let i = 0; i < 80 && s.result.kind === 'ongoing'; i++) {
        const level = ((i + seed) % 3) as AiLevel;
        const r = applyAction(s, chooseTurn(s, s.turn.slot, level, fnv1a([seed, i])));
        if (!r.ok) throw new Error(`${r.reason} seed ${seed} turn ${i}`);
        s = r.state;
      }
    }
  }, 60_000); // 전체 스위트 병렬 실행에서는 AI 탐색(판 4개 × 최대 80턴)이 기본 5초를 넘는다

  it('내 턴이 아니면 skip', () => {
    const s = start(duel(3));
    expect(chooseTurn(s, 1 - s.turn.slot, 1, 1)).toEqual({ kind: 'skip' });
  });

  it('첫 발 적 피해 — 상 > 하 (seed 20판 합계)', () => {
    const dealt = [0, 0, 0];
    for (let seed = 1; seed <= 20; seed++) {
      const s = start(duel(seed));
      const enemy = s.tanks.find((t) => t && t.slot !== s.turn.slot) as Tank;
      for (const level of [0, 2] as AiLevel[]) {
        const r = applyAction(s, chooseTurn(s, s.turn.slot, level, fnv1a([seed])));
        if (!r.ok) throw new Error(r.reason);
        dealt[level] += enemy.hp - (r.state.tanks[enemy.slot] as Tank).hp;
      }
    }
    expect(dealt[2]).toBeGreaterThan(dealt[0]);
  }, 30_000);
});
