"use client";

import { useEffect, useRef } from "react";
import type { GameState } from "../engine";
import type { EffectTracker } from "../lib/effects";
import { type GarbageGauge, computeLayout, drawGame } from "../lib/renderer";
import type { EffectQuality } from "../lib/effectsRenderer";
import { useReducedEffects } from "../hooks/useReducedEffects";

type TetrisCanvasProps = {
  /** 그릴 때 읽는다 — 엔진 진행은 부모가 맡는다 */
  stateRef: React.RefObject<GameState | null>;
  /**
   * 부모의 틱 루프가 매 애니메이션 프레임 틱 직후 부를 그리기 함수를 여기에 꽂는다
   * (캔버스가 따로 rAF를 돌면 등록 순서상 틱보다 먼저 그려 입력이 한 프레임 늦게 보인다)
   */
  drawRef: React.RefObject<(() => void) | null>;
  /** 연출 기록 — 엔진을 진행하는 쪽이 stepFrame 전후로 채운다. 없으면 연출 없이 그린다 */
  effectsRef?: React.RefObject<EffectTracker | null>;
  /** 대전 가비지 게이지 — 없으면 그리지 않는다 */
  garbageRef?: React.RefObject<GarbageGauge | null>;
  className?: string;
};

/** 저사양 감지 — 그리기 간격 평균이 이보다 길면(약 40fps 미만) 이 세션 동안 가벼운 품질로 그린다 */
const SLOW_FRAME_MS = 25;
const SAMPLE_DRAWS = 90;
/** 한 번 느리다고 판단하면 화면을 옮겨도 유지 — 판마다 다시 재며 깜빡이지 않게 */
let sessionQuality: EffectQuality = "full";

/** 테스트용 */
export function __resetCanvasQualityForTests(): void {
  sessionQuality = "full";
}

/**
 * 부모 크기에 맞춰 판을 그린다 (DPR 대응). 그리기만 하고 엔진을 진행하지 않는다
 */
export function TetrisCanvas({ stateRef, drawRef, effectsRef, garbageRef, className = "" }: TetrisCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedEffects();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!container || !canvas || !ctx) return;

    let layout = computeLayout(1, 1);
    // 연속으로 그려지는 동안의 간격만 잰다 — 멈춘 화면(일시정지·탭 전환)의 긴 간격은 버린다
    let last = 0;
    let sum = 0;
    let samples = 0;
    const measure = () => {
      if (sessionQuality === "lite") return;
      const now = performance.now();
      const gap = now - last;
      last = now;
      if (gap <= 0 || gap > 200) return;
      sum += gap;
      samples++;
      if (samples >= SAMPLE_DRAWS) {
        if (sum / samples > SLOW_FRAME_MS) sessionQuality = "lite";
        sum = 0;
        samples = 0;
      }
    };
    const draw = () => {
      const state = stateRef.current;
      if (state) {
        if (!state.over && effectsRef) measure();
        drawGame(ctx, state, layout, {
          effects: effectsRef?.current,
          reduced: reducedRef.current,
          garbage: garbageRef?.current,
          quality: sessionQuality,
        });
      }
    };
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout = computeLayout(rect.width, rect.height);
      draw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    drawRef.current = draw;

    return () => {
      observer.disconnect();
      if (drawRef.current === draw) drawRef.current = null;
    };
  }, [stateRef, drawRef, effectsRef, garbageRef]);

  // 연출 줄이기를 바꾸면 멈춰 있는 화면(일시정지·준비)도 바로 다시 그린다
  useEffect(() => {
    drawRef.current?.();
  }, [reduced, drawRef]);

  return (
    <div ref={containerRef} className={`relative h-full w-full ${className}`}>
      <canvas ref={canvasRef} className="block" aria-label="테트리스 판" role="img" />
    </div>
  );
}
