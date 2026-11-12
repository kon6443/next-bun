import { describe, it, expect } from "vitest";
import { chooseTurn } from "../ai/chooseTurn";
import * as engine from "../engine";
import { type Action, type MatchConfig, type MatchState, applyAction, createMatch, fnv1a, simulateMatch, stateHash } from "../engine";
import { type ReplayData, buildReplay, newReplayData, stateAt, summarizeReplay } from "./replay";

const duel = (seed: number): MatchConfig => ({
  seed,
  mapId: seed % 2 ? "hills" : "canyon",
  mode: "ffa",
  players: [
    { slot: 0, team: 0, tankId: 0 },
    { slot: 1, team: 0, tankId: 2 },
  ],
});

const teams = (seed: number): MatchConfig => ({
  seed,
  mapId: "canyon",
  mode: "team",
  players: [0, 1, 2, 3].map((slot) => ({ slot, team: slot < 2 ? 0 : 1, tankId: slot % 3 })),
});

/** 화면(FortressMatch.commit)과 같은 순서 — applyAction이 받아들인 행동만 기록에 넣는다 */
function playLive(config: MatchConfig): { data: ReplayData; final: MatchState } {
  const created = createMatch(config);
  if (!created.ok) throw new Error(created.reason);
  let state = created.state;
  const data = newReplayData(config);
  for (let i = 0; state.result.kind === "ongoing"; i++) {
    const action = chooseTurn(state, state.turn.slot, 2, fnv1a([config.seed, state.turn.no]));
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.reason} turn ${i}`);
    data.actions.push(action);
    state = r.state;
  }
  return { data, final: state };
}

/** 저장·전송을 거친 기록 — JSON 왕복 */
const roundTrip = (data: ReplayData): ReplayData => JSON.parse(JSON.stringify(data)) as ReplayData;

describe("로컬 리플레이", () => {
  it("다시 돌린 최종 stateHash = 실제 경기 최종 stateHash (= simulateMatch, 턴별 해시도 같다)", () => {
    for (const config of [duel(1), duel(2), teams(3)]) {
      const live = playLive(config);
      const data = roundTrip(live.data);
      const built = buildReplay(engine, data);
      if (!built.ok) throw new Error(built.reason);
      const { replay } = built;
      expect(stateHash(replay.final)).toBe(stateHash(live.final));
      expect(replay.final.result).toEqual(live.final.result);

      const sim = simulateMatch(data.config, data.actions);
      if (!sim.ok) throw new Error(sim.reason);
      expect(replay.turns.map((t) => stateHash(t.after))).toEqual(sim.hashes);
      expect(stateAt(replay, 0)).toBe(replay.initial);
      expect(stateAt(replay, replay.turns.length)).toBe(replay.final);
    }
  }, 60_000);

  it("다른 엔진 버전·깨진 행동은 재생하지 않는다 (실패 위치 포함)", () => {
    const { data } = playLive(duel(1));
    expect(buildReplay(engine, { ...data, engineVersion: data.engineVersion + 1 })).toEqual({ ok: false, reason: "ENGINE_VERSION", at: -1 });

    const broken: Action[] = [...data.actions];
    broken[1] = { kind: "fire", move: 0, angle: 999, power: 50, weaponId: 0 };
    const r = buildReplay(engine, { ...data, actions: broken });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.at).toBe(1);
  }, 30_000);

  it("요약 — 준 피해는 자기 턴에 남·다른 팀에게 깎은 HP, KO는 HP 0·추락만", () => {
    for (const config of [duel(1), duel(2), teams(3)]) {
      const built = buildReplay(engine, playLive(config).data);
      if (!built.ok) throw new Error(built.reason);
      const { replay } = built;
      const summary = summarizeReplay(replay);
      expect(summary.turns).toBe(replay.turns.length);

      // 독립 계산: 턴 전후 적 HP 차이. 추락사(out)는 피해 이벤트 없이 HP가 0이 되므로 그런 판에선 상한으로만 본다
      const lost = [0, 0, 0, 0];
      let fellOut = false;
      for (const t of replay.turns) {
        const team = t.before.tanks[t.actor]?.team;
        fellOut ||= t.events.some((e) => e.type === "death" && e.cause === "out");
        for (const before of t.before.tanks) {
          const after = before && t.after.tanks[before.slot];
          if (before && after && before.slot !== t.actor && before.team !== team) lost[t.actor] += before.hp - after.hp;
        }
      }
      for (const s of summary.slots) {
        if (fellOut) expect(s.dealt).toBeLessThanOrEqual(lost[s.slot]);
        else expect(s.dealt).toBe(lost[s.slot]);
      }
      // KO 독립 계산: 행동자 턴에 살아 있던 적이 죽었고, 그 사망 이벤트가 기권·넘기기 탈락이 아닌 경우
      const kos = [0, 0, 0, 0];
      for (const t of replay.turns) {
        const team = t.before.tanks[t.actor]?.team;
        for (const before of t.before.tanks) {
          const after = before && t.after.tanks[before.slot];
          if (!before || !after || before.slot === t.actor || before.team === team || !before.alive || after.alive) continue;
          const death = t.events.find((e) => e.type === "death" && e.slot === before.slot);
          if (death?.type === "death" && death.cause !== "resign" && death.cause !== "skips") kos[t.actor] += 1;
        }
      }
      for (const s of summary.slots) expect(s.kos).toBe(kos[s.slot]);
      expect(kos.reduce((n, k) => n + k, 0)).toBeGreaterThan(0);
    }
  }, 60_000);
});
