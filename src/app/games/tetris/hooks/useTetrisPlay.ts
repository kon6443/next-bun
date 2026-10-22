"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FRAMES_PER_SECOND,
  type GameState,
  type InputRecorder,
  type LockEvent,
  buildReplay,
  createGame,
  createInputRecorder,
  recordInput,
  stepFrame,
} from "../engine";
import { KEY_BINDINGS } from "../lib/controls";
import { type EffectTracker, createEffectTracker, observeAfter, observeBefore, resetEffects } from "../lib/effects";
import type { ReplayPayload } from "@/types/game";

export type PlayStatus = "ready" | "playing" | "paused" | "over";

export type Hud = { score: number; lines: number; level: number; frame: number };

const FRAME_MS = 1000 / FRAMES_PER_SECOND;
/** 탭이 잠깐 멈췄다 돌아와도 한 번에 따라잡는 시간 상한 — 넘는 시간은 버린다(게임이 잠깐 느려짐) */
const MAX_CATCH_UP_MS = 100;
const HUD_TIME_STEP = 15;

const EMPTY_HUD: Hud = { score: 0, lines: 0, level: 1, frame: 0 };

function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // 진동을 지원하지 않으면 무시
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

/**
 * 실시간 플레이 — 화면 주사율과 무관하게 60Hz 논리 프레임으로 엔진을 진행하고, 넘긴 입력을 그대로 기록한다
 * (리플레이 = 같은 시드 + 이 기록 → 서버가 같은 결과를 계산한다)
 */
export function useTetrisPlay(options: { vibration: boolean; onGameOver: (state: GameState, replay: ReplayPayload) => void }) {
  const stateRef = useRef<GameState | null>(null);
  const recorderRef = useRef<InputRecorder | null>(null);
  const queueRef = useRef<number[]>([]);
  /** 누르고 있는 동작: 누름 코드 → 뗌 코드 */
  const heldRef = useRef<Map<number, number>>(new Map());
  const statusRef = useRef<PlayStatus>("ready");
  const lastLockRef = useRef<LockEvent | null>(null);
  /** HUD 시간을 마지막으로 갱신한 프레임 — 판마다 처음부터 */
  const hudFrameRef = useRef(-HUD_TIME_STEP);
  /** 매 애니메이션 프레임 틱 직후 부른다 (그리기가 입력보다 한 프레임 늦지 않게) */
  const afterTickRef = useRef<(() => void) | null>(null);
  /** 화면 연출 기록 — 틱마다 stepFrame 전후 상태를 넘긴다 (엔진 결과에는 영향 없음) */
  const effectsRef = useRef<EffectTracker | null>(null);
  if (effectsRef.current === null) effectsRef.current = createEffectTracker();
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [status, setStatusState] = useState<PlayStatus>("ready");
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);

  const setStatus = useCallback((next: PlayStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const start = useCallback(
    (seed: number, das: number, arr: number) => {
      stateRef.current = createGame({ seed, das, arr });
      recorderRef.current = createInputRecorder();
      queueRef.current = [];
      heldRef.current.clear();
      lastLockRef.current = null;
      if (effectsRef.current) resetEffects(effectsRef.current);
      hudFrameRef.current = -HUD_TIME_STEP;
      setHud(EMPTY_HUD);
      setStatus("playing");
    },
    [setStatus],
  );

  /** 판을 버리고 준비 상태로 — 이전 판이 다시 진행되거나 입력을 받지 않게 */
  const reset = useCallback(() => {
    queueRef.current = [];
    heldRef.current.clear();
    if (effectsRef.current) resetEffects(effectsRef.current);
    setStatus("ready");
  }, [setStatus]);

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
    // 일시정지 중 뗀 것도 큐에 남겨 재개 첫 프레임에 적용한다
    queueRef.current.push(releaseCode);
  }, []);

  const instant = useCallback((action: number) => {
    if (statusRef.current !== "playing") return;
    queueRef.current.push(action);
  }, []);

  const releaseAll = useCallback(() => {
    for (const pressCode of Array.from(heldRef.current.keys())) release(pressCode);
  }, [release]);

  const pause = useCallback(() => {
    if (statusRef.current !== "playing") return;
    releaseAll();
    setStatus("paused");
  }, [releaseAll, setStatus]);

  const resume = useCallback(() => {
    if (statusRef.current === "paused") setStatus("playing");
  }, [setStatus]);

  // ==================== 루프 ====================

  useEffect(() => {
    let rafId = 0;
    let last = 0;
    let acc = 0;

    const tick = (state: GameState, recorder: InputRecorder) => {
      const actions = queueRef.current;
      queueRef.current = [];
      const frame = state.frame;
      const effects = effectsRef.current;
      if (effects) observeBefore(effects, state);
      const applied = stepFrame(state, actions, actions.length);
      if (effects) observeAfter(effects, state, actions, applied);
      for (let i = 0; i < applied; i++) recordInput(recorder, frame, actions[i]);

      const lock = state.lastLock;
      if (lock && lock !== lastLockRef.current) {
        lastLockRef.current = lock;
        if (optionsRef.current.vibration) vibrate(lock.lines > 0 ? 20 + lock.lines * 10 : 8);
      }
      if (state.over) {
        heldRef.current.clear();
        setStatus("over");
        if (optionsRef.current.vibration) vibrate([60, 40, 60]);
        optionsRef.current.onGameOver(state, buildReplay(state, recorder));
      }
    };

    const loop = (timestamp: number) => {
      const state = stateRef.current;
      const recorder = recorderRef.current;
      if (statusRef.current === "playing" && state && recorder) {
        if (last === 0) last = timestamp;
        acc += Math.min(timestamp - last, MAX_CATCH_UP_MS);
        last = timestamp;
        while (acc >= FRAME_MS && statusRef.current === "playing") {
          tick(state, recorder);
          acc -= FRAME_MS;
        }
        const timeChanged = state.frame - hudFrameRef.current >= HUD_TIME_STEP;
        if (timeChanged) hudFrameRef.current = state.frame;
        setHud((prev) =>
          !timeChanged && prev.score === state.score && prev.lines === state.lines && prev.level === state.level
            ? prev
            : { score: state.score, lines: state.lines, level: state.level, frame: state.frame },
        );
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

  // ==================== 키보드·자동 일시정지 ====================

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const binding = KEY_BINDINGS[e.code];
      if (!binding || isTypingTarget(e.target)) return;
      if (statusRef.current === "ready" || statusRef.current === "over") return;
      if (binding.kind === "pause") {
        e.preventDefault();
        if (e.repeat) return;
        if (statusRef.current === "playing") pause();
        else resume();
        return;
      }
      // 일시정지 화면에서는 Space·Enter가 포커스된 버튼("계속하기" 등)을 누르게 둔다
      if (statusRef.current !== "playing") return;
      e.preventDefault();
      if (e.repeat) return; // 키 반복은 엔진의 DAS/ARR이 맡는다
      if (binding.kind === "hold") {
        press(binding.press, binding.release);
      } else {
        instant(binding.action);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const binding = KEY_BINDINGS[e.code];
      if (binding?.kind === "hold") release(binding.press);
    };
    const onHidden = () => {
      if (document.hidden) pause();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [instant, pause, press, release, resume]);

  return { stateRef, afterTickRef, effectsRef, status, hud, start, reset, pause, resume, press, release, instant };
}
