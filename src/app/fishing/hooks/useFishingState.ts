'use client';

import { useState, useCallback, useRef } from 'react';
import type { Fish, CaughtFish } from '../types/fish';
import type { FishingState, FishingPoint } from '../types/game';
import { spawnRandomFish, generateCaughtFish, generateWaitTime } from '../utils/fishSpawn';
import {
  BITE_TIME_LIMIT,
  CASTING_DURATION,
  CHALLENGE_SPEED_BASE,
  CHALLENGE_SPEED_DIFF_MULT,
  CHALLENGE_MIN_ZONE_SIZE,
  CHALLENGE_MAX_ZONE_SIZE,
  CHALLENGE_ZONE_DIFF_MULT,
  CHALLENGE_ZONE_MIN_START,
  CHALLENGE_ZONE_RANGE,
  CHALLENGE_DEFAULT_ZONE,
  CHALLENGE_DEFAULT_DIFFICULTY,
} from '../config/constants';

export interface FishingContext {
  state: FishingState;
  currentFish: Fish | null;
  currentPoint: FishingPoint | null;
  challengeGauge: number;
  challengeZone: [number, number];
  lastCatch: CaughtFish | null;
  inventory: CaughtFish[];
  waitProgress: number;
  biteTimeLeft: number;
}

const INITIAL_CONTEXT: FishingContext = {
  state: 'idle',
  currentFish: null,
  currentPoint: null,
  challengeGauge: 0,
  challengeZone: CHALLENGE_DEFAULT_ZONE,
  lastCatch: null,
  inventory: [],
  waitProgress: 0,
  biteTimeLeft: 1,
};

/** 난이도 기반 챌린지 성공 구간 생성 */
function createChallengeZone(difficulty: number): [number, number] {
  const zoneSize = Math.max(
    CHALLENGE_MIN_ZONE_SIZE,
    CHALLENGE_MAX_ZONE_SIZE - difficulty * CHALLENGE_ZONE_DIFF_MULT,
  );
  const zoneStart = CHALLENGE_ZONE_MIN_START + Math.random() * (CHALLENGE_ZONE_RANGE - zoneSize);
  return [zoneStart, zoneStart + zoneSize];
}

export function useFishingState(fishPool: Fish[]) {
  const [ctx, setCtx] = useState<FishingContext>(INITIAL_CONTEXT);

  const waitTimerRef = useRef(0);
  const waitDurationRef = useRef(0);
  const castTimerRef = useRef(0);
  const biteTimerRef = useRef(0);
  const gaugeDirectionRef = useRef(1);

  const startFishing = useCallback((point: FishingPoint) => {
    const fish = spawnRandomFish(fishPool, point.availableFishIds);
    waitTimerRef.current = 0;
    waitDurationRef.current = generateWaitTime(fish);
    castTimerRef.current = 0;

    setCtx((prev) => ({
      ...prev,
      state: 'casting',
      currentFish: fish,
      currentPoint: point,
      waitProgress: 0,
    }));
  }, [fishPool]);

  const onBiteTap = useCallback(() => {
    setCtx((prev) => {
      if (prev.state !== 'bite') return prev;

      const diff = prev.currentFish?.difficulty ?? CHALLENGE_DEFAULT_DIFFICULTY;
      gaugeDirectionRef.current = 1;

      return {
        ...prev,
        state: 'challenge',
        challengeGauge: 0,
        challengeZone: createChallengeZone(diff),
        biteTimeLeft: 1,
      };
    });
  }, []);

  const onChallengeTap = useCallback(() => {
    setCtx((prev) => {
      if (prev.state !== 'challenge' || !prev.currentFish || !prev.currentPoint) return prev;

      const { challengeGauge, challengeZone } = prev;
      const isHit = challengeGauge >= challengeZone[0] && challengeGauge <= challengeZone[1];

      if (isHit) {
        const caught = generateCaughtFish(prev.currentFish, prev.currentPoint.id);
        return {
          ...prev,
          state: 'success',
          lastCatch: caught,
          inventory: [...prev.inventory, caught],
        };
      }
      return { ...prev, state: 'fail', lastCatch: null };
    });
  }, []);

  const dismiss = useCallback(() => {
    setCtx((prev) => ({
      ...prev,
      state: 'idle',
      currentFish: null,
      currentPoint: null,
    }));
  }, []);

  const cancelFishing = useCallback(() => {
    setCtx((prev) => ({
      ...prev,
      state: 'idle',
      currentFish: null,
      currentPoint: null,
    }));
  }, []);

  /** 매 프레임 낚시 상태 업데이트 */
  const updateFishing = useCallback((deltaTime: number) => {
    setCtx((prev) => {
      switch (prev.state) {
        case 'casting': {
          castTimerRef.current += deltaTime;
          if (castTimerRef.current >= CASTING_DURATION) {
            return { ...prev, state: 'waiting', waitProgress: 0 };
          }
          return prev;
        }

        case 'waiting': {
          waitTimerRef.current += deltaTime;
          const progress = Math.min(waitTimerRef.current / waitDurationRef.current, 1);
          if (progress >= 1) {
            biteTimerRef.current = 0;
            return { ...prev, state: 'bite', waitProgress: 1, biteTimeLeft: 1 };
          }
          return { ...prev, waitProgress: progress };
        }

        case 'bite': {
          biteTimerRef.current += deltaTime;
          const timeLeft = Math.max(0, 1 - biteTimerRef.current / BITE_TIME_LIMIT);
          if (timeLeft <= 0) {
            return { ...prev, state: 'fail', lastCatch: null, biteTimeLeft: 0 };
          }
          return { ...prev, biteTimeLeft: timeLeft };
        }

        case 'challenge': {
          const diff = prev.currentFish?.difficulty ?? CHALLENGE_DEFAULT_DIFFICULTY;
          const speed = CHALLENGE_SPEED_BASE + diff * CHALLENGE_SPEED_DIFF_MULT;
          let gauge = prev.challengeGauge + gaugeDirectionRef.current * speed * deltaTime;

          if (gauge >= 1) { gauge = 1; gaugeDirectionRef.current = -1; }
          else if (gauge <= 0) { gauge = 0; gaugeDirectionRef.current = 1; }

          return { ...prev, challengeGauge: gauge };
        }

        default:
          return prev;
      }
    });
  }, []);

  return {
    fishingCtx: ctx,
    startFishing,
    onBiteTap,
    onChallengeTap,
    dismiss,
    cancelFishing,
    updateFishing,
  };
}
