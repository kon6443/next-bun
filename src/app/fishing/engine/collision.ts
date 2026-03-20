import type { Position, GameMap, FishingPoint } from '../types/game';
import type { Player } from '../types/player';
import { FISHING_POINT_DETECT_OFFSET } from '../config/constants';

/** 두 점 사이 거리 */
export function distance(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 위치를 이동 가능 영역 안으로 클램핑 */
export function clampToWalkable(pos: Position, map: GameMap, playerWidth: number): Position {
  const { walkableArea } = map;
  const halfW = playerWidth / 2;
  return {
    x: Math.max(walkableArea.x + halfW, Math.min(pos.x, walkableArea.x + walkableArea.width - halfW)),
    y: Math.max(walkableArea.y, Math.min(pos.y, walkableArea.y + walkableArea.height)),
  };
}

/** 가장 가까운 낚시 포인트 찾기 (범위 내) */
export function findNearbyFishingPoint(
  player: Player,
  map: GameMap,
): FishingPoint | null {
  let closest: FishingPoint | null = null;
  let closestDist = Infinity;

  for (const point of map.fishingPoints) {
    const dist = distance(player.position, point.position);
    const detectRange = point.radius + FISHING_POINT_DETECT_OFFSET;

    if (dist <= detectRange && dist < closestDist) {
      closest = point;
      closestDist = dist;
    }
  }

  return closest;
}
