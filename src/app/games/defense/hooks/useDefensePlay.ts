"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EVENT,
  EVENT_STRIDE,
  OP,
  TICKS_PER_SECOND,
  type CommandRecorder,
  type GameState,
  type Stage,
  applyCommand,
  createCommandRecorder,
  createGame,
  earlyCallBonus,
  recordCommand,
  step,
} from "../engine";
import { toRenderView } from "../lib/toRenderView";
import { type RenderView, createRenderView } from "../renderer/renderView";

/**
 * 디펜스 게임 루프 (defense DESIGN §F10 useDefensePlay) — 엔진 상태는 ref, HUD 값만 setState(바뀐 값이 있을 때만)
 * - 누산기 acc += min(dt, 100) × 배속, 프레임당 최대 8틱(넘으면 밀린 시간을 버린다)
 * - dispatch = applyCommand 즉시 → 수락한 명령만 기록(리플레이 입력). 일시정지 중에도 조작 가능(§E3·§F3)
 * - 1웨이브를 부르기 전(ready)에는 틱을 돌리지 않는다 — 준비 시간은 판 길이·리플레이에 들어가지 않는다
 * - 화면이 가려지거나 창이 포커스를 잃으면 자동 일시정지
 * 캠페인(F1a) 전용 — 증강 대기(augment)·이어하기는 F1b·F2
 */

export type PlayStatus = "ready" | "playing" | "paused" | "over";
export const SPEEDS = [1, 2, 3] as const;
export type Speed = (typeof SPEEDS)[number];

export type HudSnapshot = {
  status: PlayStatus;
  speed: Speed;
  tick: number;
  lives: number;
  gold: number;
  wavesStarted: number;
  wavesCleared: number;
  totalWaves: number;
  /** 다음 웨이브까지 남은 틱 (0 = 카운트다운 없음) */
  countdown: number;
  /** 지금 부르면 받는 조기 호출 보너스 */
  earlyBonus: number;
  /** 웨이브 호출 가능 (1웨이브 전 또는 카운트다운 중) */
  canCall: boolean;
  victory: boolean;
  /** 엔진 상태가 바뀔 때마다 오른다 — 링 메뉴처럼 상태를 직접 읽는 UI의 다시 그리기 신호 */
  version: number;
};

export type PlayResult = {
  victory: boolean;
  livesLeft: number;
  endTick: number;
  /** 적 종류별 누수로 잃은 목숨 (§F0-3 실패 원인) */
  leakedLivesByEnemy: number[];
  /** 가장 많이 샌 웨이브 (1부터, 없으면 0) */
  worstWave: number;
  /** 이 판의 명령 로그 (리플레이 입력 — 다시보기 저장) */
  inputs: number[];
};

export type FrameInfo = { prev: RenderView; curr: RenderView; alpha: number; now: number; frameMs: number };

type Options = {
  stage: Stage;
  seed: number;
  /** 틱마다 렌더 이벤트 — 파티클·누수 경고 연출 */
  onTickEvents?: (events: readonly number[], view: RenderView, prev: RenderView) => void;
  /** 매 프레임 그리기 */
  onFrame?: (frame: FrameInfo) => void;
  onOver?: (result: PlayResult) => void;
};

const TICK_MS = 1000 / TICKS_PER_SECOND;
const MAX_TICKS_PER_FRAME = 8;
const MAX_CATCH_UP_MS = 100;
/** 판이 끝난 뒤에도 연출(파티클·숫자)이 사라질 만큼만 더 그리고 루프를 멈춘다 (결과 화면 배터리) */
const FRAMES_AFTER_OVER = 90;

function snapshotOf(state: GameState, stage: Stage, status: PlayStatus, speed: Speed, version: number): HudSnapshot {
  const totalWaves = stage.waves.length;
  const canCall = !state.over && state.wavesStarted < totalWaves && (state.wavesStarted === 0 || state.countdown > 0);
  return {
    status,
    speed,
    tick: state.tick,
    lives: state.lives,
    gold: state.gold,
    wavesStarted: state.wavesStarted,
    wavesCleared: state.wavesCleared,
    totalWaves,
    countdown: state.countdown,
    earlyBonus: state.wavesStarted > 0 ? earlyCallBonus(state) : 0,
    canCall,
    victory: state.victory,
    version,
  };
}

/**
 * 지난 스냅샷과 화면에 보이는 값이 같은지 — 객체를 만들지 않고 상태와 바로 비교한다(매 프레임 불린다, §F10 프레임당 할당 0)
 * tick·countdown은 매 틱 바뀐다 — 카운트다운은 보이는 단위(초)가 바뀔 때만
 */
function sameHud(a: HudSnapshot, state: GameState, status: PlayStatus, speed: Speed, version: number): boolean {
  return (
    a.status === status &&
    a.speed === speed &&
    a.version === version &&
    a.lives === state.lives &&
    a.gold === state.gold &&
    a.wavesStarted === state.wavesStarted &&
    a.wavesCleared === state.wavesCleared &&
    Math.ceil(a.countdown / TICKS_PER_SECOND) === Math.ceil(state.countdown / TICKS_PER_SECOND) &&
    a.earlyBonus === (state.wavesStarted > 0 ? earlyCallBonus(state) : 0) &&
    a.victory === state.victory &&
    // canCall은 위 값(웨이브 수·카운트다운 0 여부)에서 나온다 — 카운트다운이 0이 되는 순간만 따로
    a.countdown > 0 === state.countdown > 0
  );
}

export function useDefensePlay({ stage, seed, onTickEvents, onFrame, onOver }: Options) {
  const stateRef = useRef<GameState>(null as unknown as GameState);
  const recorderRef = useRef<CommandRecorder>(null as unknown as CommandRecorder);
  if (stateRef.current === null) {
    stateRef.current = createGame(stage, seed);
    recorderRef.current = createCommandRecorder();
  }
  const viewsRef = useRef<{ prev: RenderView; curr: RenderView } | null>(null);
  if (viewsRef.current === null) {
    const prev = toRenderView(stateRef.current, createRenderView());
    viewsRef.current = { prev, curr: toRenderView(stateRef.current, createRenderView()) };
  }
  const statusRef = useRef<PlayStatus>("ready");
  const speedRef = useRef<Speed>(1);
  const versionRef = useRef(0);
  const callbacksRef = useRef({ onTickEvents, onFrame, onOver });
  callbacksRef.current = { onTickEvents, onFrame, onOver };
  /** 적 id → [종류, 웨이브] — 누수 이벤트 때 적은 이미 배열에서 빠져 있다 */
  const spawnedRef = useRef(new Map<number, [number, number]>());
  const leaksRef = useRef({ byEnemy: [] as number[], byWave: [] as number[] });

  const [hud, setHud] = useState<HudSnapshot>(() => snapshotOf(stateRef.current, stage, "ready", 1, 0));
  const hudRef = useRef(hud);

  const publish = useCallback(() => {
    if (sameHud(hudRef.current, stateRef.current, statusRef.current, speedRef.current, versionRef.current)) return;
    const next = snapshotOf(stateRef.current, stage, statusRef.current, speedRef.current, versionRef.current);
    hudRef.current = next;
    setHud(next);
  }, [stage]);

  const setStatus = useCallback(
    (status: PlayStatus) => {
      statusRef.current = status;
      publish();
    },
    [publish],
  );

  const finish = useCallback(() => {
    const state = stateRef.current;
    statusRef.current = "over";
    const byWave = leaksRef.current.byWave;
    let worstWave = 0;
    for (let w = 1; w < byWave.length; w++) if ((byWave[w] ?? 0) > (byWave[worstWave] ?? 0)) worstWave = w;
    callbacksRef.current.onOver?.({
      victory: state.victory,
      livesLeft: state.lives,
      endTick: state.endTick,
      leakedLivesByEnemy: leaksRef.current.byEnemy.slice(),
      worstWave: (byWave[worstWave] ?? 0) > 0 ? worstWave : 0,
      inputs: recorderRef.current.inputs.slice(),
    });
    publish();
  }, [publish]);

  /** 명령 — 수락하면 기록하고 true. 끝난 판·무효 명령은 false(엔진이 상태를 바꾸지 않는다) */
  const dispatch = useCallback(
    (op: number, a = 0, b = 0): boolean => {
      const state = stateRef.current;
      if (statusRef.current === "over" || !applyCommand(state, op, a, b)) return false;
      recordCommand(recorderRef.current, state.tick, op, a, b);
      versionRef.current += 1;
      // 일시정지 중 건설도 바로 보이게 — 현재 렌더 상태만 다시 담는다(적은 그대로라 보간에 영향 없음)
      if (viewsRef.current) toRenderView(state, viewsRef.current.curr);
      // 웨이브를 부르면 시작한다 — 일시정지 중에 불러도(부른 뜻이 진행)
      if (op === OP.CALL_WAVE) statusRef.current = "playing";
      publish();
      return true;
    },
    [publish],
  );

  const togglePause = useCallback(() => {
    const status = statusRef.current;
    if (status === "over") return;
    if (status === "paused") setStatus(stateRef.current.wavesStarted > 0 ? "playing" : "ready");
    else setStatus("paused");
  }, [setStatus]);

  const cycleSpeed = useCallback(() => {
    const index = SPEEDS.indexOf(speedRef.current);
    speedRef.current = SPEEDS[(index + 1) % SPEEDS.length];
    publish();
  }, [publish]);

  useEffect(() => {
    let rafId = 0;
    let last = 0;
    let acc = 0;
    let overFrames = 0;
    const events: number[] = [];
    /** 프레임마다 같은 객체를 고쳐 넘긴다(할당 0) — 받는 쪽은 다음 프레임 전까지만 쓴다 */
    const frame: FrameInfo = { prev: viewsRef.current!.prev, curr: viewsRef.current!.curr, alpha: 1, now: 0, frameMs: 0 };
    const loop = (now: number) => {
      const frameMs = last === 0 ? 0 : now - last;
      last = now;
      const state = stateRef.current;
      const views = viewsRef.current!;
      if (statusRef.current === "playing") {
        acc += Math.min(frameMs, MAX_CATCH_UP_MS) * speedRef.current;
        let ticks = 0;
        while (acc >= TICK_MS && ticks < MAX_TICKS_PER_FRAME && !state.over) {
          events.length = 0;
          step(state, events);
          const swap = views.prev;
          views.prev = views.curr;
          views.curr = toRenderView(state, swap);
          for (let i = 0; i < events.length; i += EVENT_STRIDE) {
            if (events[i] === EVENT.SPAWN) {
              // 새 적은 배열 끝에 붙는다 — 뒤에서부터 찾는다
              let wave = 0;
              for (let k = state.enemies.length - 1; k >= 0; k--) {
                if (state.enemies[k].id === events[i + 1]) {
                  wave = state.enemies[k].wave;
                  break;
                }
              }
              spawnedRef.current.set(events[i + 1], [events[i + 2], wave]);
            } else if (events[i] === EVENT.LEAK) {
              const spawned = spawnedRef.current.get(events[i + 1]);
              if (spawned) {
                const leaks = leaksRef.current;
                leaks.byEnemy[spawned[0]] = (leaks.byEnemy[spawned[0]] ?? 0) + events[i + 2];
                leaks.byWave[spawned[1]] = (leaks.byWave[spawned[1]] ?? 0) + events[i + 2];
                spawnedRef.current.delete(events[i + 1]);
              }
            } else if (events[i] === EVENT.DEATH) {
              spawnedRef.current.delete(events[i + 1]);
            }
          }
          callbacksRef.current.onTickEvents?.(events, views.curr, views.prev);
          acc -= TICK_MS;
          ticks++;
        }
        if (ticks === MAX_TICKS_PER_FRAME) acc = 0;
        if (state.over) finish();
        else publish();
      } else if (statusRef.current === "ready") {
        acc = 0;
      }
      // 일시정지 중에는 acc를 그대로 둔다 — 멈춘 위치(보간 비율)가 재개 순간 튀지 않게
      frame.prev = views.prev;
      frame.curr = views.curr;
      frame.alpha = statusRef.current === "ready" ? 1 : acc / TICK_MS;
      frame.now = now;
      frame.frameMs = frameMs;
      callbacksRef.current.onFrame?.(frame);
      if (statusRef.current === "over" && ++overFrames > FRAMES_AFTER_OVER) return;
      rafId = requestAnimationFrame(loop);
    };
    const autoPause = () => {
      if (statusRef.current === "playing") setStatus("paused");
      last = 0;
    };
    const onVisibility = () => {
      if (document.hidden) autoPause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", autoPause);
    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", autoPause);
    };
  }, [finish, publish, setStatus]);

  return { hud, dispatch, togglePause, cycleSpeed, stateRef, recorderRef };
}
