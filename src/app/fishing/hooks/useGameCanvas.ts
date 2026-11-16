'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { CANVAS_RESIZE_DEBOUNCE } from '../config/constants';

/** 백버퍼 배율 상한 — 3x 기기에서 매 프레임 칠하는 픽셀을 2x 대비 2.25배로 늘리지 않는다(포트리스·디펜스와 같은 값) */
const DPR_CAP = 2;

export interface CanvasSize {
  width: number;
  height: number;
}

export function useGameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });

  const updateSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const w = rect.width;
    const h = rect.height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }

    setSize({ width: w, height: h });
  }, []);

  useEffect(() => {
    updateSize();

    let timeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(timeout);
      timeout = setTimeout(updateSize, CANVAS_RESIZE_DEBOUNCE);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeout);
    };
  }, [updateSize]);

  return { canvasRef, size };
}
