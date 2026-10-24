"use client";

import { useCallback, useRef, useState } from "react";
import type { ParticlePool } from "../renderer/particles";
import { QualityController } from "../renderer/quality";

/**
 * 그래픽 품질 자동 하향 (defense §F10, games-polish FE-09) — 그리기 시간이 예산(7ms)을 2초 넘게 넘으면 한 단계씩:
 * 데미지 숫자 끔 → 파티클 절반 → DPR 1.5 → DPR 1. 낮추기만 한다(깜빡임 방지) — 판(PlaySession)마다 처음부터
 * 실기기 측정 전이라 안전한 기본값: 빠른 기기는 0단계 그대로, 설정 패널에 품질 항목은 아직 없다
 */
export function useAutoQuality(baseDprCap: number) {
  const controllerRef = useRef<QualityController | null>(null);
  controllerRef.current ??= new QualityController("auto");
  const [dprCap, setDprCap] = useState(() => Math.min(baseDprCap, controllerRef.current!.current.dprCap));
  /** 데미지 숫자를 품질이 허용하나 — 설정과 함께 본다(둘 다 켜져야 그린다) */
  const numbersAllowedRef = useRef(true);

  /** 프레임마다 그리기 시간(ms) — 단계가 내려가면 파티클 칸 수·DPR·숫자에 반영한다 */
  const record = useCallback(
    (drawMs: number, nowMs: number, particles: ParticlePool) => {
      const controller = controllerRef.current!;
      if (!controller.record(drawMs, nowMs)) return;
      const level = controller.current;
      numbersAllowedRef.current = level.damageNumbers;
      particles.setLimit(particles.capacity * level.particleScale);
      setDprCap(Math.min(baseDprCap, level.dprCap));
    },
    [baseDprCap],
  );

  return { dprCap, numbersAllowedRef, record };
}
