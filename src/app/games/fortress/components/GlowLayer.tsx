"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BattleFrame } from "../hooks/useBattleView";
import type { GlowPost } from "../renderer/glowPost";

/** 후처리 한 번에 이 시간(ms, 지수 평균)을 넘기면 느린 기기로 보고 끈다 */
export const GLOW_SLOW_MS = 6;
/** 판단 전에 모으는 프레임 수(시작 직후 셰이더 컴파일 지연을 빼려고) */
const GLOW_WARMUP_FRAMES = 30;

/**
 * 시안 "glow" 후처리 층(D-025 B) — enabled일 때만 three를 동적 import한다(경기 화면 안에서만 — 홈·목록 번들에 들어가지 않게)
 * onFrame을 useBattleView에 넘기면 그 프레임을 빛(bloom)·충격파 빛으로 그려 전장 위에 screen 합성으로 겹친다
 * WebGL을 못 쓰거나, 컨텍스트를 잃거나, 후처리가 느리거나(GLOW_SLOW_MS), 전장 자동 품질이 low면 스스로 꺼진다 — 꺼져도 전장은 vivid 그대로
 */
export function useGlowLayer(enabled: boolean): { onFrame?: (frame: BattleFrame) => void; layer: React.ReactNode; active: boolean } {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const postRef = useRef<GlowPost | null>(null);
  const statRef = useRef({ avg: 0, frames: 0 });
  const [active, setActive] = useState(false);
  const [off, setOff] = useState(false);

  useEffect(() => {
    if (!enabled || off) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let alive = true;
    const lost = (e: Event) => {
      e.preventDefault();
      setOff(true);
    };
    canvas.addEventListener("webglcontextlost", lost);
    import("../renderer/glowPost")
      .then(({ createGlowPost }) => {
        if (!alive) return;
        const post = createGlowPost(canvas);
        if (!post) {
          setOff(true);
          return;
        }
        postRef.current = post;
        statRef.current = { avg: 0, frames: 0 };
        setActive(true);
      })
      .catch(() => {
        if (alive) setOff(true);
      });
    return () => {
      alive = false;
      canvas.removeEventListener("webglcontextlost", lost);
      postRef.current?.dispose();
      postRef.current = null;
      setActive(false);
    };
  }, [enabled, off]);

  const onFrame = useCallback((frame: BattleFrame) => {
    const post = postRef.current;
    if (!post) return;
    // 전장 자동 품질이 low로 내려갔거나(느린 기기), 후처리가 켜진 동안 프레임이 밀리면(GPU 합성 비용은 그리기 호출 시간에 안 잡힌다) 끈다
    if (frame.quality === "low" || frame.slow) {
      setOff(true);
      return;
    }
    const t0 = performance.now();
    try {
      post.render(frame);
    } catch {
      // 후처리가 던지면 끈다 — 전장 루프(품질 판정·프레임 시각)를 막지 않게
      setOff(true);
      return;
    }
    const ms = performance.now() - t0;
    const st = statRef.current;
    st.frames++;
    if (st.frames <= GLOW_WARMUP_FRAMES) return;
    st.avg = st.avg === 0 ? ms : st.avg * 0.95 + ms * 0.05;
    if (st.avg > GLOW_SLOW_MS) setOff(true);
  }, []);

  const shown = enabled && !off;
  return {
    onFrame: shown ? onFrame : undefined,
    active: shown && active,
    layer: shown ? (
      <canvas
        ref={canvasRef}
        className={`pointer-events-none absolute inset-0 block h-full w-full mix-blend-screen transition-opacity duration-300 ${active ? "opacity-100" : "opacity-0"}`}
        aria-hidden
        data-testid="fortress-glow"
      />
    ) : null,
  };
}
