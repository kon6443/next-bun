import { type MutableRefObject, useEffect } from "react";
import { chooseTurn } from "../ai/chooseTurn";
import { type Action, type MatchEvent, type MatchState, TANKS, applyAction, fnv1a } from "../engine";
import type { Controller } from "../lib/controllers";
import { CAMERA_WAIT_POLL_MS, cameraWaitDone } from "../lib/cameraWait";
import { type Phase, currentTank } from "../lib/matchFlow";
import { recordThink } from "../lib/perfProbe";

const AI_DELAY_MS = 450;

/**
 * AI 차례 — 잠깐 "생각 중"을 보여 준 뒤 계산(메인 스레드, 실측은 perfProbe). paused(안내·나가기 확인·설정 시트)면 멈춘다
 * 고른 발을 카메라가 컷 없이 따라갈 수 있는 자리에 올 때까지 조금 더 기다린다(최대 CAMERA_WAIT_MAX_MS, lib/cameraWait) — 앞 착탄 자리에서 바로 쏘면 비행 시작에 화면이 넘어간다
 * AI가 거부되는 행동을 내면(규칙 변경 등) "생각 중"에 멈추지 않게 파워 0으로 넘긴다
 */
export function useAiTurn({
  phase,
  paused,
  controllers,
  seed,
  stateRef,
  commit,
  cameraReadyFor,
}: {
  phase: Phase;
  paused: boolean;
  controllers: readonly Controller[];
  seed: number;
  stateRef: MutableRefObject<MatchState>;
  commit: (action: Action) => boolean;
  cameraReadyFor: (events: readonly MatchEvent[]) => boolean;
}): void {
  useEffect(() => {
    if (phase !== "think" || paused) return;
    let timer = 0;
    let chosen: { action: Action; events: readonly MatchEvent[] | null; since: number } | null = null;
    const step = () => {
      const s = stateRef.current;
      const level = controllers[s.turn.slot];
      if (level === "human" || level === "remote") return;
      if (!chosen) {
        const t0 = performance.now();
        const action = chooseTurn(s, s.turn.slot, level, fnv1a([seed, s.turn.no]));
        recordThink(level, performance.now() - t0);
        const r = applyAction(s, action);
        chosen = { action, events: r.ok ? r.events : null, since: performance.now() };
      }
      if (chosen.events && !cameraWaitDone(performance.now() - chosen.since, cameraReadyFor(chosen.events))) {
        timer = window.setTimeout(step, CAMERA_WAIT_POLL_MS);
        return;
      }
      if (!commit(chosen.action)) {
        console.warn("[fortress] AI 행동 거부 — 넘기기로 대체", chosen.action);
        commit({ kind: "fire", move: 0, angle: 90, power: 0, weaponId: TANKS[currentTank(s).tankId].weapons[0] });
      }
    };
    timer = window.setTimeout(step, AI_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [phase, paused, controllers, seed, stateRef, commit, cameraReadyFor]);
}
