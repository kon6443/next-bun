"use client";

import { useEffect, useRef } from "react";
import type { GameState } from "../engine";
import { computeLayout, drawGame } from "../lib/renderer";

type TetrisCanvasProps = {
  /** 그릴 때 읽는다 — 엔진 진행은 부모가 맡는다 */
  stateRef: React.RefObject<GameState | null>;
  /**
   * 부모의 틱 루프가 매 애니메이션 프레임 틱 직후 부를 그리기 함수를 여기에 꽂는다
   * (캔버스가 따로 rAF를 돌면 등록 순서상 틱보다 먼저 그려 입력이 한 프레임 늦게 보인다)
   */
  drawRef: React.RefObject<(() => void) | null>;
  className?: string;
};

/**
 * 부모 크기에 맞춰 판을 그린다 (DPR 대응). 그리기만 하고 엔진을 진행하지 않는다
 */
export function TetrisCanvas({ stateRef, drawRef, className = "" }: TetrisCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!container || !canvas || !ctx) return;

    let layout = computeLayout(1, 1);
    const draw = () => {
      const state = stateRef.current;
      if (state) drawGame(ctx, state, layout);
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
  }, [stateRef, drawRef]);

  return (
    <div ref={containerRef} className={`relative h-full w-full ${className}`}>
      <canvas ref={canvasRef} className="block" aria-label="테트리스 판" role="img" />
    </div>
  );
}
