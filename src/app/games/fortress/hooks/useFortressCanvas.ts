"use client";

import { useEffect, useRef } from "react";
import type { ViewSize } from "../renderer/camera";

const DPR_CAP = 2;

/**
 * 캔버스 1장을 컨테이너 크기·DPR(상한 2)에 맞춘다 — 크기·DPR이 바뀌면 백버퍼를 다시 잡고 onResize를 부른다
 * 그리기는 호출자(게임 루프)가 ctxRef·viewRef로 한다. ctx는 CSS px 좌표(setTransform(dpr))
 */
export function useFortressCanvas(onResize: (view: ViewSize) => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const viewRef = useRef<ViewSize>({ width: 0, height: 0 });
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    let lastKey = "";
    const layout = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      const key = `${rect.width}x${rect.height}@${dpr}`;
      if (key === lastKey) return;
      lastKey = key;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctxRef.current = ctx;
      viewRef.current = { width: rect.width, height: rect.height };
      onResizeRef.current(viewRef.current);
    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(container);
    // DPR만 바뀌면(모니터 이동·확대 비율) 크기 변화가 없다 — 현재 DPR 질의가 풀리면 다시 맞춘다
    let media: MediaQueryList | null = null;
    const onDpr = () => {
      layout();
      watch();
    };
    const watch = () => {
      media?.removeEventListener("change", onDpr);
      media = typeof window.matchMedia === "function" ? window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`) : null;
      media?.addEventListener("change", onDpr);
    };
    watch();
    return () => {
      observer.disconnect();
      media?.removeEventListener("change", onDpr);
    };
  }, []);

  return { containerRef, canvasRef, ctxRef, viewRef };
}
