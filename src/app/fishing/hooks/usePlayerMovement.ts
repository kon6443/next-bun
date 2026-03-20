'use client';

import { useCallback } from 'react';
import type { Player } from '../types/player';
import type { GameMap, Position, Direction } from '../types/game';
import { clampToWalkable, distance } from '../engine/collision';
import { PLAYER_ARRIVAL_THRESHOLD, PLAYER_ANIM_INTERVAL } from '../config/constants';

/** 이동 방향 계산 */
function getDirection(from: Position, to: Position): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  }
  return dy > 0 ? 'down' : 'up';
}

export function usePlayerMovement(map: GameMap) {
  /** 터치/클릭 위치로 이동 목표 설정 */
  const setTarget = useCallback(
    (player: Player, targetX: number, targetY: number): Player => {
      const clamped = clampToWalkable({ x: targetX, y: targetY }, map, player.width);
      return {
        ...player,
        targetPosition: clamped,
        direction: getDirection(player.position, clamped),
        isMoving: true,
      };
    },
    [map],
  );

  /** 매 프레임 위치 업데이트 */
  const updatePosition = useCallback(
    (player: Player, deltaTime: number): Player => {
      if (!player.targetPosition || player.fishingState !== 'idle') {
        return player.isMoving ? { ...player, isMoving: false, targetPosition: null } : player;
      }

      const { position, targetPosition, speed } = player;
      const dist = distance(position, targetPosition);

      if (dist < PLAYER_ARRIVAL_THRESHOLD) {
        return {
          ...player,
          position: targetPosition,
          targetPosition: null,
          isMoving: false,
        };
      }

      const dx = targetPosition.x - position.x;
      const dy = targetPosition.y - position.y;
      const ratio = Math.min((speed * deltaTime) / dist, 1);
      const newPos = clampToWalkable(
        { x: position.x + dx * ratio, y: position.y + dy * ratio },
        map,
        player.width,
      );

      const newAnimTimer = player.animTimer + deltaTime;
      const frameFlip = newAnimTimer > PLAYER_ANIM_INTERVAL;

      return {
        ...player,
        position: newPos,
        direction: getDirection(position, newPos),
        isMoving: true,
        animFrame: frameFlip ? (player.animFrame + 1) % 2 : player.animFrame,
        animTimer: frameFlip ? 0 : newAnimTimer,
      };
    },
    [map],
  );

  return { setTarget, updatePosition };
}
