"use client";

import { vibrate } from "@/app/games/_shared/lib/vibrate";
import { useInputQueue } from "./useInputQueue";
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
import { KEY_BINDINGS, isTypingTarget } from "../lib/controls";
import { type EffectTracker, createEffectTracker, drainCues, observeAfter, observeBefore, resetEffects } from "../lib/effects";
import { getSoundPlayer } from "../lib/sound/soundPlayer";
import type { ReplayPayload } from "@/types/game";
import { advanceClock, createClock, resetClock } from "@/app/games/_shared/lib/fixedStep";

export type PlayStatus = "ready" | "playing" | "paused" | "over";

export type Hud = { score: number; lines: number; level: number; frame: number };

const FRAME_MS = 1000 / FRAMES_PER_SECOND;
/** 탭이 잠깐 멈췄다 돌아와도 한 번에 따라잡는 시간 상한 — 넘는 시간은 버린다(게임이 잠깐 느려짐) */
const MAX_CATCH_UP_MS = 100;
const HUD_TIME_STEP = 15;

const EMPTY_HUD: Hud = { score: 0, lines: 0, level: 1, frame: 0 };


/**
 * 실시간 플레이 — 화면 주사율과 무관하게 60Hz 논리 프레임으로 엔진을 진행하고, 넘긴 입력을 그대로 기록한다
 * (리플레이 = 같은 시드 + 이 기록 → 서버가 같은 결과를 계산한다)
 */
export function useTetrisPlay(options: { vibration: boolean; onGameOver: (state: GameState, replay: ReplayPayload) => void }) {
  const stateRef = useRef<GameState | null>(null);
  const recorderRef = useRef<InputRecorder | null>(null);
  const statusRef = useRef<PlayStatus>("ready");
  // 일시정지 중 뗀 것도 큐에 남겨 재개 첫 프레임에 적용한다
  const { heldRef, press, release, instant, releaseAll, take, clear } = useInputQueue(statusRef, { keepReleaseWhenStopped: true });
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
    // 배경음악은 진행 중에만 (설정이 꺼져 있으면 플레이어가 무시한다)
    getSoundPlayer().setMusicPlaying(next === "playing");
  }, []);

  // 소리 플레이어를 화면에 들어올 때 만들어 둔다 — 첫 조작(오디오 시작 조건)을 놓치지 않게. 나가면 음악을 끈다
  useEffect(() => {
    const player = getSoundPlayer();
    return () => player.setMusicPlaying(false);
  }, []);

  const start = useCallback(
    (seed: number, das: number, arr: number) => {
      stateRef.current = createGame({ seed, das, arr });
      recorderRef.current = createInputRecorder();
      clear();
      heldRef.current.clear();
      lastLockRef.current = null;
      if (effectsRef.current) resetEffects(effectsRef.current);
      hudFrameRef.current = -HUD_TIME_STEP;
      setHud(EMPTY_HUD);
      setStatus("playing");
    },
    [setStatus, heldRef, clear],
  );

  /** 판을 버리고 준비 상태로 — 이전 판이 다시 진행되거나 입력을 받지 않게 */
  const reset = useCallback(() => {
    // 이전 판을 지운다 — 준비 화면 뒤로 끝난 판이 얼어붙어 보이지 않게 (FE-20)
    stateRef.current = null;
    clear();
    heldRef.current.clear();
    if (effectsRef.current) resetEffects(effectsRef.current);
    setStatus("ready");
  }, [setStatus, heldRef, clear]);

  // ==================== 입력 ====================

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
    const clock = createClock();

    const tick = (state: GameState, recorder: InputRecorder) => {
      const actions = take();
      const frame = state.frame;
      const effects = effectsRef.current;
      if (effects) observeBefore(effects, state);
      const applied = stepFrame(state, actions, actions.length);
      if (effects) {
        observeAfter(effects, state, actions, applied);
        // 효과음 — 같은 관찰에서 나온 신호 (꺼져 있으면 아무것도 하지 않는다)
        getSoundPlayer().playCues(drainCues(effects));
      }
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
        advanceClock(clock, timestamp, MAX_CATCH_UP_MS);
        while (clock.acc >= FRAME_MS && statusRef.current === "playing") {
          tick(state, recorder);
          clock.acc -= FRAME_MS;
        }
        const timeChanged = state.frame - hudFrameRef.current >= HUD_TIME_STEP;
        if (timeChanged) hudFrameRef.current = state.frame;
        setHud((prev) =>
          !timeChanged && prev.score === state.score && prev.lines === state.lines && prev.level === state.level
            ? prev
            : { score: state.score, lines: state.lines, level: state.level, frame: state.frame },
        );
      } else {
        resetClock(clock);
      }
      afterTickRef.current?.();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [setStatus, heldRef, take]);

  // ==================== 키보드·자동 일시정지 ====================

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const binding = KEY_BINDINGS[e.code];
      // 소리 설정 모달 같은 대화상자 안의 키는 게임으로 보내지 않는다(P·Esc가 뒤의 판을 다시 진행시키지 않게)
      if (!binding || isTypingTarget(e.target, { includeDialogs: true })) return;
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
      // 키 반복은 엔진의 DAS/ARR이 맡는다 — 단 누른 채 일시정지·재개한 키(일시정지가 뗐다)는 반복 신호로 다시 누른다(press가 중복을 거른다, FE-09)
      if (binding.kind === "hold") {
        press(binding.press, binding.release);
      } else if (!e.repeat) {
        instant(binding.action);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const binding = KEY_BINDINGS[e.code];
      if (binding?.kind === "hold") release(binding.press);
      // 판 조작 키의 keyup도 막는다 — 포커스가 남은 머리줄 버튼(톱니·❚❚)을 브라우저에 따라 Space keyup이 누른다(대전과 같은 방어, FE-36)
      if (binding && binding.kind !== "pause" && statusRef.current === "playing" && !isTypingTarget(e.target, { includeDialogs: true })) {
        e.preventDefault();
      }
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
