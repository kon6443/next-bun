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

/** 방향키 → 속도 벡터 */
const DIRECTION_VECTORS: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function updateAnim(player: Player, deltaTime: number, isMoving: boolean): Pick<Player, 'animFrame' | 'animTimer'> {
  if (!isMoving) return { animFrame: 0, animTimer: 0 };
  const newTimer = player.animTimer + deltaTime;
  const flip = newTimer > PLAYER_ANIM_INTERVAL;
  return {
    animFrame: flip ? (player.animFrame + 1) % 2 : player.animFrame,
    animTimer: flip ? 0 : newTimer,
  };
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

  /** 키보드 방향키로 연속 이동 (매 프레임 호출) */
  const moveByDirection = useCallback(
    (player: Player, direction: Direction, deltaTime: number): Player => {
      const vec = DIRECTION_VECTORS[direction];
      const dist = player.speed * deltaTime;
      const newPos = clampToWalkable(
        { x: player.position.x + vec.x * dist, y: player.position.y + vec.y * dist },
        map,
        player.width,
      );

      return {
        ...player,
        position: newPos,
        direction,
        isMoving: true,
        targetPosition: null, // 키보드 이동 시 터치 목표 취소
        ...updateAnim(player, deltaTime, true),
      };
    },
    [map],
  );

  /** 매 프레임 위치 업데이트 (터치/클릭 기반) */
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

      return {
        ...player,
        position: newPos,
        direction: getDirection(position, newPos),
        isMoving: true,
        ...updateAnim(player, deltaTime, true),
      };
    },
    [map],
  );

  return { setTarget, moveByDirection, updatePosition };
}
