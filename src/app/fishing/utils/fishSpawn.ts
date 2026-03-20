import type { Fish, CaughtFish } from '../types/fish';
import { FISH_WEIGHT_MIN_RATIO, FISH_WEIGHT_SCALE } from '../config/constants';

/** 가중치 기반 랜덤 물고기 선택 */
export function spawnRandomFish(pool: Fish[], availableFishIds?: string[]): Fish {
  let candidates = pool;
  if (availableFishIds && availableFishIds.length > 0) {
    const filtered = pool.filter((f) => availableFishIds.includes(f.id));
    if (filtered.length > 0) candidates = filtered;
  }

  const totalWeight = candidates.reduce((sum, f) => sum + f.catchWeight, 0);
  let roll = Math.random() * totalWeight;

  for (const fish of candidates) {
    roll -= fish.catchWeight;
    if (roll <= 0) return fish;
  }

  return candidates[candidates.length - 1];
}

/** 물고기 크기/무게 랜덤 생성 */
export function generateCaughtFish(fish: Fish, pointId: string): CaughtFish {
  const sizeRange = fish.maxSize - fish.minSize;
  const size = Math.round((fish.minSize + Math.random() * sizeRange) * 10) / 10;
  const sizeRatio = sizeRange > 0 ? (size - fish.minSize) / sizeRange : 0;
  const weight = Math.round(fish.baseWeight * (FISH_WEIGHT_MIN_RATIO + sizeRatio * FISH_WEIGHT_SCALE));

  return {
    id: `${fish.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fishId: fish.id,
    name: fish.name,
    grade: fish.grade,
    size,
    weight,
    caughtAt: Date.now(),
    pointId,
  };
}

/** 대기 시간 랜덤 생성 (초) */
export function generateWaitTime(fish: Fish): number {
  const [min, max] = fish.waitTimeRange;
  return min + Math.random() * (max - min);
}
