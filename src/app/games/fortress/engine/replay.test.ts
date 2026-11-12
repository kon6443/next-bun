import { describe, it, expect } from 'vitest';
import { MAX_ACTIONS, REASON } from './constants';
import { type Action, applyAction } from './game';
import { stateHash } from './hash';
import { simulateMatch } from './replay';
import { type MatchConfig, type MatchResult, type MatchState, createMatch } from './state';
import golden from './__fixtures__/golden-matches.json';

type Expected = { ok: true; hashes: string[]; result: MatchResult } | { ok: false; reason: string; at: number };
type GoldenCase = { name: string; config: MatchConfig; actions: Action[]; expected: Expected };
const cases = golden as unknown as GoldenCase[];

const summarize = (config: MatchConfig, actions: Action[]): Expected => {
  const r = simulateMatch(config, actions);
  return r.ok ? { ok: true, hashes: r.hashes, result: r.final.result } : { ok: false, reason: r.reason, at: r.at };
};

describe('골든 경기 픽스처 (백엔드와 같은 파일)', () => {
  it('실패 사유 8종 + 설정 오류가 있고, 개인전·팀전·무승부·스킵 탈락·낙하 즉사·기권 판이 있다', () => {
    const reasons = new Set(cases.filter((c) => !c.expected.ok).map((c) => (c.expected as { reason: string }).reason));
    for (const reason of Object.values(REASON)) expect(reasons).toContain(reason);
    expect(reasons).toContain('BAD_TEAMS');
    const ok = cases.filter((c) => c.expected.ok);
    const results = ok.map((c) => (c.expected as { result: MatchResult }).result);
    expect(results.some((r) => r.kind === 'draw')).toBe(true);
    expect(results.some((r) => r.kind === 'win' && r.team !== undefined)).toBe(true);
    expect(ok.some((c) => c.config.players.length === 4 && c.config.mode === 'ffa')).toBe(true);
    // 무기 6종이 모두 발사된다
    const fired = new Set(ok.flatMap((c) => c.actions.filter((a) => a.kind === 'fire' && a.power > 0).map((a) => (a as { weaponId: number }).weaponId)));
    expect([...fired].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  for (const c of cases) {
    it(c.name, () => {
      expect(summarize(c.config, c.actions)).toEqual(c.expected);
    });
  }

  it(`행동이 ${MAX_ACTIONS}개를 넘으면 TOO_MANY_ACTIONS (서버 CPU 상한)`, () => {
    const config = cases[0].config;
    const actions = Array.from({ length: MAX_ACTIONS + 1 }, (): Action => ({ kind: 'skip' }));
    expect(simulateMatch(config, actions)).toEqual({ ok: false, reason: 'TOO_MANY_ACTIONS', at: -1 });
  });

  it('state를 턴마다 JSON 왕복해도 해시가 같다 (서버 Redis 스냅샷·재동기화)', () => {
    for (const c of cases.filter((x) => x.expected.ok)) {
      const created = createMatch(c.config);
      if (!created.ok) throw new Error(created.reason);
      let state: MatchState = JSON.parse(JSON.stringify(created.state));
      const hashes: string[] = [];
      for (const action of c.actions) {
        const r = applyAction(state, action);
        if (!r.ok) throw new Error(r.reason);
        state = JSON.parse(JSON.stringify(r.state));
        hashes.push(stateHash(state));
      }
      expect(hashes, c.name).toEqual((c.expected as { hashes: string[] }).hashes);
    }
  });
});
