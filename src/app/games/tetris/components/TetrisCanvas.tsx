"use client";

import { useEffect, useRef } from "react";
import type { GameState } from "../engine";
import type { EffectTracker } from "../lib/effects";
import { type GarbageGauge, computeLayout, drawGame } from "../lib/renderer";
import { type QualityMonitor, createQualityMonitor, sampleDraw } from "../lib/renderQuality";
import { type BoardSkins, DEFAULT_BOARD_SKINS } from "../lib/skins";
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
  /** 판 주인의 스킨(보드 슬롯) — 내 판은 내 장착, 상대·리플레이는 그 기록 주인의 장착. 없으면 기본 */
  skins?: BoardSkins;
  className?: string;
};

/** 저사양 감지 — 화면 프레임 간격 이동 평균으로 계속 판단한다(lib/renderQuality). 화면을 옮겨도 이어서 — 판마다 처음부터 재며 깜빡이지 않게 */
let qualityMonitor: QualityMonitor = createQualityMonitor();

/** 테스트용 */
export function __resetCanvasQualityForTests(): void {
  qualityMonitor = createQualityMonitor();
}

/**
 * 부모 크기에 맞춰 판을 그린다 (DPR 대응). 그리기만 하고 엔진을 진행하지 않는다
 */
export function TetrisCanvas({ stateRef, drawRef, effectsRef, garbageRef, skins = DEFAULT_BOARD_SKINS, className = "" }: TetrisCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedEffects();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  // 값이 같으면 같은 객체로 — 부모가 매 렌더 새 객체를 넘겨도 다시 그리지 않게
  const { block, effect, board } = skins;
  const skinsRef = useRef(skins);
  /** 표본 없이 다시 그린다 — 스킨·연출 줄이기 변경처럼 화면 프레임이 아닌 그리기(저사양 판정 간격을 쪼개지 않게) */
  const redrawRef = useRef<(() => void) | null>(null);
  if (skinsRef.current.block !== block || skinsRef.current.effect !== effect || skinsRef.current.board !== board) skinsRef.current = skins;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!container || !canvas || !ctx) return;

    let layout = computeLayout(1, 1);
    /** 마지막으로 그린 것 — 같으면 다시 그리지 않는다(준비·일시정지·게임오버·재생 정지 중 매 프레임 전체 그리기를 피한다, FE-11) */
    let drawn: { state: GameState | null; frame: number; over: boolean; reduced: boolean; skins: BoardSkins; layoutVersion: number } | null = null;
    let layoutVersion = 0;
    /** frameGap·now: 화면 프레임에서 부를 때만(onAnimationFrame) — 저사양 판정 표본. resize 등 그 밖의 그리기는 표본이 아니다 */
    const draw = (frameGap = 0, now = 0) => {
      const state = stateRef.current;
      const next = { state, frame: state?.frame ?? -1, over: state?.over ?? false, reduced: reducedRef.current, skins: skinsRef.current, layoutVersion };
      if (
        drawn &&
        drawn.state === next.state &&
        drawn.frame === next.frame &&
        drawn.over === next.over &&
        drawn.reduced === next.reduced &&
        drawn.skins === next.skins &&
        drawn.layoutVersion === next.layoutVersion
      ) {
        return;
      }
      drawn = next;
      if (state) {
        const quality = !state.over && effectsRef && frameGap > 0 ? sampleDraw(qualityMonitor, frameGap, now) : qualityMonitor.quality;
        drawGame(ctx, state, layout, {
          effects: effectsRef?.current,
          reduced: reducedRef.current,
          garbage: garbageRef?.current,
          quality,
          skins: skinsRef.current,
        });
      } else {
        // 판이 없다(새 판 준비) — 이전 판이 남아 보이지 않게 비운다
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
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
      layoutVersion++;
      draw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    // 모니터를 옮기거나 확대 비율이 바뀌어 DPR만 바뀌면 크기 변화가 없다 — 현재 DPR 해상도 질의가 풀리면 다시 맞추고 새 DPR로 다시 건다
    // (디펜스 useDefenseCanvas와 같은 방식, games-polish FE-19)
    let media: MediaQueryList | null = null;
    const watchDpr = () => {
      media?.removeEventListener("change", onDpr);
      media = typeof window.matchMedia === "function" ? window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`) : null;
      media?.addEventListener("change", onDpr);
    };
    const onDpr = () => {
      resize();
      watchDpr();
    };
    watchDpr();
    // 표본은 부모 루프가 매 화면 프레임(rAF) 부르는 이 함수의 호출 간격 — 실제로 그린 프레임에서만 쓴다
    // (그린 간격을 재면 0.5배속 재생처럼 엔진 프레임이 드문 화면을 느린 기기로 오판한다. 멈춘 화면은 그리지 않아 표본이 없다)
    let lastFrameAt = 0;
    const onAnimationFrame = () => {
      const now = performance.now();
      const gap = lastFrameAt === 0 ? 0 : now - lastFrameAt;
      lastFrameAt = now;
      draw(gap, now);
    };
    drawRef.current = onAnimationFrame;
    redrawRef.current = () => draw();

    return () => {
      redrawRef.current = null;
      observer.disconnect();
      media?.removeEventListener("change", onDpr);
      if (drawRef.current === onAnimationFrame) drawRef.current = null;
    };
  }, [stateRef, drawRef, effectsRef, garbageRef]);

  // 연출 줄이기·스킨을 바꾸면 멈춰 있는 화면(일시정지·준비)도 바로 다시 그린다
  useEffect(() => {
    redrawRef.current?.();
  }, [reduced, block, effect, board]);

  return (
    <div ref={containerRef} className={`relative h-full w-full ${className}`}>
      <canvas ref={canvasRef} className="block" aria-label="테트리스 판" role="img" />
    </div>
  );
}
