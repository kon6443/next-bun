/** 2D 좌표 */
export interface Position {
  x: number;
  y: number;
}

/** 카메라 (뷰포트 오프셋) */
export interface Camera {
  x: number;
  y: number;
}

/** 방향 */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** 맵 영역 타입 */
export type TerrainType = 'ground' | 'water' | 'fishing_point';

/** 맵 설정 */
export interface GameMap {
  id: string;
  name: string;
  /** 맵 전체 크기 (px) */
  width: number;
  height: number;
  /** 물 영역 y 경계 (이 값 이하는 물) */
  waterLineY: number;
  /** 낚시 포인트 목록 */
  fishingPoints: FishingPoint[];
  /** 이동 가능 영역 (사각형) */
  walkableArea: { x: number; y: number; width: number; height: number };
  /** 배경 색상 */
  colors: MapColors;
}

export interface MapColors {
  sky: string;
  water: string;
  waterDeep: string;
  ground: string;
  groundDark: string;
  grass: string;
}

/** 낚시 포인트 */
export interface FishingPoint {
  id: string;
  position: Position;
  /** 이 포인트에서 잡히는 물고기 ID 목록 (비어있으면 전체) */
  availableFishIds?: string[];
  /** 낚시 가능 반경 (px) */
  radius: number;
}

/** 게임 전체 상태 */
export type GamePhase = 'loading' | 'playing' | 'paused';

/** 낚시 상태 */
export type FishingState =
  | 'idle'        // 자유 이동
  | 'casting'     // 캐스팅 애니메이션
  | 'waiting'     // 입질 대기 (방치 구간)
  | 'bite'        // 입질! 터치 필요
  | 'challenge'   // 미니게임
  | 'success'     // 성공 결과
  | 'fail';       // 실패 결과
