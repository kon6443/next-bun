"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FRAMES_PER_SECOND, type GameState, type InputRecorder, createInputRecorder, recordInput } from "../../engine";
import {
  type BattleLock,
  type BattleReplayInput,
  type BattleState,
  buildBattleReplay,
  createBattle,
  pendingGarbageLines,
  receiveGarbage,
  stepBattle,
} from "../../battle-engine";
import { KEY_BINDINGS } from "../../lib/controls";
import { type EffectTracker, createEffectTracker, observeAfter, observeBefore, resetEffects } from "../../lib/effects";
import type { GarbageGauge } from "../../lib/renderer";

export type BattlePlayStatus = "ready" | "playing" | "over";

const FRAME_MS = 1000 / FRAMES_PER_SECOND;
/**
 * 탭이 백그라운드에 갔다 돌아오면 지난 시간만큼 한 번에 따라잡는다(대전은 멈출 수 없다 — DESIGN §7)
 * 너무 길면(브라우저가 오래 재운 경우) 한 프레임에 수천 틱을 돌지 않게 자른다
 */
const MAX_CATCH_UP_MS = 10_000;

type BattlePlayOptions = {
  /** 블록이 고정될 때마다 — 서버 lock 보고·공격 표시 */
  onLock?: (lock: BattleLock, bs: BattleState) => void;
  /** 매 논리 프레임 뒤 — 가짜 상대 진행(미리보기) 등 */
  onFrame?: (bs: BattleState) => void;
  /** 탈락 — 리플레이(입력 + 받은 가비지)와 함께 */
  onOver?: (bs: BattleState, replay: BattleReplayInput) => void;
};

/** 입력창이나 열린 대화상자(기권 확인 등) 안의 키는 게임으로 보내지 않는다 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable || target.closest('[role="dialog"]') !== null
  );
}

/**
 * 대전 플레이 — 대전 래퍼(stepBattle)를 60Hz 논리 프레임으로 진행하고 입력을 기록한다
 * 싱글(useTetrisPlay)과 달리 일시정지가 없고, 받은 가비지는 다음 틱 시작에 그 프레임 도착으로 넣는다(리플레이와 같은 순서)
 */
export function useBattlePlay(options: BattlePlayOptions = {}) {
  const battleRef = useRef<BattleState | null>(null);
  /** 캔버스가 읽는 엔진 상태 (= battleRef.current.game) */
  const gameRef = useRef<GameState | null>(null);
  const recorderRef = useRef<InputRecorder | null>(null);
  const settingsRef = useRef({ das: 0, arr: 0 });
  const queueRef = useRef<number[]>([]);
  const heldRef = useRef<Map<number, number>>(new Map());
  /** 소켓으로 받았지만 아직 판에 넘기지 않은 가비지 */
  const incomingRef = useRef<{ id: number; lines: number; hole: number }[]>([]);
  const statusRef = useRef<BattlePlayStatus>("ready");
  const afterTickRef = useRef<(() => void) | null>(null);
  const effectsRef = useRef<EffectTracker | null>(null);
  if (effectsRef.current === null) effectsRef.current = createEffectTracker();
  const garbageRef = useRef<GarbageGauge | null>({ pending: 0, active: 0 });
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [status, setStatusState] = useState<BattlePlayStatus>("ready");
  const setStatus = useCallback((next: BattlePlayStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const start = useCallback(
    (seed: number, das: number, arr: number) => {
      const bs = createBattle({ seed, das, arr });
      battleRef.current = bs;
      gameRef.current = bs.game;
      recorderRef.current = createInputRecorder();
      settingsRef.current = { das, arr };
      queueRef.current = [];
      heldRef.current.clear();
      incomingRef.current = [];
      garbageRef.current = { pending: 0, active: 0 };
      if (effectsRef.current) resetEffects(effectsRef.current);
      setStatus("playing");
    },
    [setStatus],
  );

  /** 경기가 끝나(승리·종료) 더 진행하지 않는다 — 탈락은 루프가 스스로 over로 바꾼다 */
  const stop = useCallback(() => {
    queueRef.current = [];
    heldRef.current.clear();
    if (statusRef.current === "playing") setStatus("over");
  }, [setStatus]);

  /** 서버에서 받은 가비지 — 다음 틱에 그 프레임 도착으로 넣는다 */
  const receive = useCallback((ev: { id: number; lines: number; hole: number }) => {
    if (statusRef.current === "playing") incomingRef.current.push(ev);
  }, []);

  /** 지금까지의 리플레이 — 살아남은 플레이어가 경기 종료 때 제출한다 */
  const buildReplay = useCallback((): BattleReplayInput | null => {
    const bs = battleRef.current;
    const recorder = recorderRef.current;
    if (!bs || !recorder) return null;
    return buildBattleReplay(bs, recorder.inputs, settingsRef.current.das, settingsRef.current.arr);
  }, []);

  // ==================== 입력 ====================

  const press = useCallback((pressCode: number, releaseCode: number) => {
    if (statusRef.current !== "playing" || heldRef.current.has(pressCode)) return;
    heldRef.current.set(pressCode, releaseCode);
    queueRef.current.push(pressCode);
  }, []);

  const release = useCallback((pressCode: number) => {
    const releaseCode = heldRef.current.get(pressCode);
    if (releaseCode === undefined) return;
    heldRef.current.delete(pressCode);
    if (statusRef.current === "playing") queueRef.current.push(releaseCode);
  }, []);

  const instant = useCallback((action: number) => {
    if (statusRef.current === "playing") queueRef.current.push(action);
  }, []);

  // ==================== 루프 ====================

  useEffect(() => {
    let rafId = 0;
    let last = 0;
    let acc = 0;

    const tick = (bs: BattleState, recorder: InputRecorder) => {
      const incoming = incomingRef.current;
      if (incoming.length > 0) {
        incomingRef.current = [];
        // id 오름차순으로 — receiveGarbage는 직전 id 이하를 버린다
        incoming.sort((a, b) => a.id - b.id);
        for (const ev of incoming) receiveGarbage(bs, ev);
      }
      const actions = queueRef.current;
      queueRef.current = [];
      const game = bs.game;
      const frame = game.frame;
      const effects = effectsRef.current;
      if (effects) observeBefore(effects, game);
      const { applied, lock } = stepBattle(bs, actions, actions.length);
      if (effects) observeAfter(effects, game, actions, applied);
      for (let i = 0; i < applied; i++) recordInput(recorder, frame, actions[i]);

      let active = 0;
      for (const item of bs.queue) if (item.activeAt <= game.frame) active += item.lines;
      garbageRef.current = { pending: pendingGarbageLines(bs), active };

      if (lock) optionsRef.current.onLock?.(lock, bs);
      optionsRef.current.onFrame?.(bs);
      if (game.over) {
        heldRef.current.clear();
        setStatus("over");
        optionsRef.current.onOver?.(bs, buildBattleReplay(bs, recorder.inputs, settingsRef.current.das, settingsRef.current.arr));
      }
    };

    const loop = (timestamp: number) => {
      const bs = battleRef.current;
      const recorder = recorderRef.current;
      if (statusRef.current === "playing" && bs && recorder) {
        if (last === 0) last = timestamp;
        acc += Math.min(timestamp - last, MAX_CATCH_UP_MS);
        last = timestamp;
        while (acc >= FRAME_MS && statusRef.current === "playing") {
          tick(bs, recorder);
          acc -= FRAME_MS;
        }
      } else {
        last = 0;
        acc = 0;
      }
      afterTickRef.current?.();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [setStatus]);

  // ==================== 키보드 ====================

  useEffect(() => {
    const releaseAll = () => {
      for (const pressCode of Array.from(heldRef.current.keys())) release(pressCode);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const binding = KEY_BINDINGS[e.code];
      if (!binding || isTypingTarget(e.target) || statusRef.current !== "playing") return;
      // 대전은 멈출 수 없다 — 일시정지 키는 무시
      if (binding.kind === "pause") return;
      e.preventDefault();
      if (e.repeat) return;
      if (binding.kind === "hold") press(binding.press, binding.release);
      else instant(binding.action);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const binding = KEY_BINDINGS[e.code];
      if (binding?.kind === "hold") release(binding.press);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    // 창을 벗어나면 누르고 있던 키를 뗀다(keyup을 못 받아 계속 눌린 채로 남지 않게)
    window.addEventListener("blur", releaseAll);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseAll);
    };
  }, [instant, press, release]);

  return { battleRef, gameRef, effectsRef, garbageRef, afterTickRef, status, start, stop, receive, buildReplay, press, release, instant };
}
