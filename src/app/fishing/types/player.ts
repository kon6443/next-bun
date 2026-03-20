import type { Position, Direction, FishingState } from './game';
import {
  PLAYER_SPEED,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
} from '../config/constants';

/** 플레이어 상태 */
export interface Player {
  position: Position;
  /** 이동 목표 좌표 (null이면 정지) */
  targetPosition: Position | null;
  direction: Direction;
  isMoving: boolean;
  /** 현재 낚시 상태 */
  fishingState: FishingState;
  /** 이동 속도 (px/sec) */
  speed: number;
  /** 플레이어 크기 */
  width: number;
  height: number;
  /** 걷기 애니메이션 프레임 */
  animFrame: number;
  animTimer: number;
}

/** 맵에 따른 플레이어 초기 상태 생성 */
export function createDefaultPlayer(spawnPosition?: Position): Player {
  return {
    position: spawnPosition ?? { x: 400, y: 420 },
    targetPosition: null,
    direction: 'down',
    isMoving: false,
    fishingState: 'idle',
    speed: PLAYER_SPEED,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    animFrame: 0,
    animTimer: 0,
  };
}
