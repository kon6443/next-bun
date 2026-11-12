/**
 * 로컬 리플레이 (F2) — 끝난 경기를 {engineVersion, config, actions[]}로 남기고 처음부터 다시 돌려 턴별 연출 재료를 만든다
 * 서버 리플레이(F6)도 같은 형식을 쓴다. 재생은 기록의 엔진 버전으로(engine-versions) — 엔진 밖이라 순수 규약 대상은 아니지만 부수효과는 없다
 */

import { type Action, ENGINE_VERSION, type MatchConfig, type MatchEvent, type MatchState } from "../engine";
import type { ReplayEngine } from "../engine-versions";

export type ReplayData = { engineVersion: number; config: MatchConfig; actions: Action[] };

/** 한 턴(행동 하나) — actor = 행동 직전 턴의 slot, before → events 연출 → after */
export type ReplayTurn = { actor: number; action: Action; before: MatchState; events: MatchEvent[]; after: MatchState };
export type Replay = { initial: MatchState; turns: ReplayTurn[]; final: MatchState };
export type ReplayFail = { ok: false; reason: string; at: number };

export function newReplayData(config: MatchConfig): ReplayData {
  return { engineVersion: ENGINE_VERSION, config, actions: [] };
}

/** 기록을 처음부터 다시 돌린다 — 실패하면 사유와 행동 인덱스(설정 오류 −1). 결과는 simulateMatch와 같은 applyAction 순서 */
export function buildReplay(engine: ReplayEngine, data: ReplayData): { ok: true; replay: Replay } | ReplayFail {
  if (data.engineVersion !== engine.ENGINE_VERSION) return { ok: false, reason: "ENGINE_VERSION", at: -1 };
  if (!Array.isArray(data.actions) || data.actions.length > engine.MAX_ACTIONS) return { ok: false, reason: engine.CONFIG_REASON.TOO_MANY_ACTIONS, at: -1 };
  const created = engine.createMatch(data.config);
  if (!created.ok) return { ok: false, reason: created.reason, at: -1 };
  const turns: ReplayTurn[] = [];
  let state = created.state;
  for (let i = 0; i < data.actions.length; i++) {
    const action = data.actions[i];
    const r = engine.applyAction(state, action);
    if (!r.ok) return { ok: false, reason: r.reason, at: i };
    turns.push({ actor: state.turn.slot, action, before: state, events: r.events, after: r.state });
    state = r.state;
  }
  return { ok: true, replay: { initial: created.state, turns, final: state } };
}

/** index = 끝난 턴 수(0 … turns.length) 시점의 state */
export function stateAt(replay: Replay, index: number): MatchState {
  return index <= 0 ? replay.initial : replay.turns[Math.min(index, replay.turns.length) - 1].after;
}

export type SlotSummary = { slot: number; team: number; hp: number; alive: boolean; dealt: number; kos: number };
export type MatchSummary = { turns: number; slots: SlotSummary[] };

/**
 * 경기 요약 — dealt = 자기 턴에 적(다른 팀, 개인전은 남 전부)에게 실제로 깎은 HP, kos = 자기 턴에 HP 0·추락으로 쓰러뜨린 적 수
 * 기권·연속 넘기기 탈락은 KO로 세지 않는다. 자기·같은 편 피해는 넣지 않는다
 */
export function summarizeReplay(replay: Replay): MatchSummary {
  const dealt = [0, 0, 0, 0];
  const kos = [0, 0, 0, 0];
  for (const turn of replay.turns) {
    const actorTeam = turn.before.tanks[turn.actor]?.team;
    for (const e of turn.events) {
      if (e.type !== "damage" && e.type !== "death") continue;
      const target = turn.before.tanks[e.slot];
      if (!target || e.slot === turn.actor || target.team === actorTeam) continue;
      if (e.type === "damage") dealt[turn.actor] += e.amount;
      else if (e.cause === "hp" || e.cause === "out") kos[turn.actor] += 1;
    }
  }
  const slots: SlotSummary[] = [];
  for (const t of replay.final.tanks) {
    if (t) slots.push({ slot: t.slot, team: t.team, hp: t.hp, alive: t.alive, dealt: dealt[t.slot], kos: kos[t.slot] });
  }
  return { turns: replay.turns.length, slots };
}
