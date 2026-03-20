/** 물고기 등급 */
export type FishGrade = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** 물고기 정의 (마스터 데이터) */
export interface Fish {
  id: string;
  name: string;
  grade: FishGrade;
  /** 최소 크기 (cm) */
  minSize: number;
  /** 최대 크기 (cm) */
  maxSize: number;
  /** 기본 무게 (g, 크기에 비례하여 계산) */
  baseWeight: number;
  /** 잡힐 확률 가중치 (높을수록 잘 잡힘) */
  catchWeight: number;
  /** 입질 대기 시간 범위 [최소, 최대] (초) */
  waitTimeRange: [number, number];
  /** 챌린지 난이도 (0~1, 높을수록 어려움) */
  difficulty: number;
  /** 설명 */
  description: string;
  /** 스프라이트 색상 (도형 기반 렌더링용) */
  color: string;
}

/** 잡은 물고기 (인벤토리 아이템) */
export interface CaughtFish {
  id: string;
  fishId: string;
  name: string;
  grade: FishGrade;
  /** 실제 크기 (cm) */
  size: number;
  /** 실제 무게 (g) */
  weight: number;
  /** 잡은 시각 */
  caughtAt: number;
  /** 잡은 낚시 포인트 ID */
  pointId: string;
}
