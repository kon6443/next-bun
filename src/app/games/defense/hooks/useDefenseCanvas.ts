"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { drawMapLayer } from "../renderer/mapLayer";
import type { RenderMap } from "../renderer/renderView";
import { type Viewport, backingSize, fitViewport } from "../renderer/viewport";

/**
 * 캔버스 2장(bg 정적 맵 / fg 매 프레임) 관리 — 컨테이너 크기·DPR 상한이 바뀌면 백버퍼를 맞추고 bg를 다시 그린다 (§F10)
 * fg 그리기는 호출자(게임 루프)가 viewportRef·fgContextRef로 한다
 * viewport는 상태로도 준다 — 캔버스 위 DOM(슬롯 버튼·링 메뉴)을 화면 좌표에 놓을 때 크기가 바뀌면 다시 그리게
 */
export function useDefenseCanvas(map: RenderMap, dprCap: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const fgRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const fgContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const layoutMapRef = useRef<RenderMap | null>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);

  const layout = useCallback(() => {
    const container = containerRef.current;
    const bg = bgRef.current;
    const fg = fgRef.current;
    if (!container || !bg || !fg) return;
    const rect = container.getBoundingClientRect();
    const viewport = fitViewport(rect.width, rect.height, map.width, map.height, window.devicePixelRatio, dprCap);
    // 마운트 직후 직접 호출 + ResizeObserver 첫 콜백이 겹친다 — 맵·크기·DPR이 같으면 다시 잡지 않는다
    const previous = viewportRef.current;
    if (
      previous &&
      layoutMapRef.current === map &&
      previous.width === viewport.width &&
      previous.height === viewport.height &&
      previous.dpr === viewport.dpr
    ) {
      return;
    }
    layoutMapRef.current = map;
    const size = backingSize(viewport);
    for (const canvas of [bg, fg]) {
      canvas.width = size.width;
      canvas.height = size.height;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    }
    viewportRef.current = viewport;
    setViewport(viewport);
    fgContextRef.current = fg.getContext('2d');
    const bgContext = bg.getContext('2d', { alpha: false });
    if (bgContext) drawMapLayer(bgContext, map, viewport);
  }, [map, dprCap]);

  useEffect(() => {
    layout();
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(layout);
    observer.observe(container);
    return () => observer.disconnect();
  }, [layout]);

  return { containerRef, bgRef, fgRef, viewportRef, fgContextRef, viewport };
}
