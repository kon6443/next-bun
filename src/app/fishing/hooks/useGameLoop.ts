'use client';

import { useRef, useEffect, useCallback } from 'react';
import { MAX_DELTA_TIME } from '../config/constants';

type GameLoopCallback = (deltaTime: number, totalTime: number) => void;

export function useGameLoop(callback: GameLoopCallback) {
  const callbackRef = useRef(callback);
  const rafIdRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const totalTimeRef = useRef<number>(0);
  const isRunningRef = useRef(true);

  callbackRef.current = callback;

  const loop = useCallback((timestamp: number) => {
    if (!isRunningRef.current) {
      rafIdRef.current = requestAnimationFrame(loop);
      return;
    }

    if (lastTimeRef.current === 0) {
      lastTimeRef.current = timestamp;
    }

    const rawDelta = (timestamp - lastTimeRef.current) / 1000;
    const deltaTime = Math.min(rawDelta, MAX_DELTA_TIME);
    lastTimeRef.current = timestamp;
    totalTimeRef.current += deltaTime;

    callbackRef.current(deltaTime, totalTimeRef.current);

    rafIdRef.current = requestAnimationFrame(loop);
  }, []);

  useEffect(() => {
    rafIdRef.current = requestAnimationFrame(loop);

    const handleVisibility = () => {
      if (document.hidden) {
        isRunningRef.current = false;
      } else {
        isRunningRef.current = true;
        lastTimeRef.current = 0;
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loop]);
}
