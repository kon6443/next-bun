import type { FishGrade } from '../types/fish';

// ─── 게임 루프 ───────────────────────────────────────────
export const MAX_DELTA_TIME = 0.1; // 탭 전환 후 복귀 시 최대 delta (초)

// ─── 플레이어 ────────────────────────────────────────────
export const PLAYER_SPEED = 120;       // px/sec
export const PLAYER_WIDTH = 28;        // px
export const PLAYER_HEIGHT = 36;       // px
export const PLAYER_ARRIVAL_THRESHOLD = 3; // 도착 판정 거리 (px)
export const PLAYER_ANIM_INTERVAL = 0.2;  // 걷기 애니메이션 전환 간격 (초)

// ─── 낚시 상태 타이밍 ────────────────────────────────────
export const BITE_TIME_LIMIT = 3;          // 입질 후 터치 제한 시간 (초)
export const CASTING_DURATION = 0.8;       // 캐스팅 애니메이션 시간 (초)
export const CHALLENGE_SPEED_BASE = 1.5;   // 챌린지 게이지 기본 속도
export const CHALLENGE_SPEED_DIFF_MULT = 2;// 난이도 가속 배율

// ─── 챌린지 성공 구간 ────────────────────────────────────
export const CHALLENGE_MIN_ZONE_SIZE = 0.12;
export const CHALLENGE_MAX_ZONE_SIZE = 0.35;
export const CHALLENGE_ZONE_DIFF_MULT = 0.25;
export const CHALLENGE_ZONE_MIN_START = 0.2;
export const CHALLENGE_ZONE_RANGE = 0.6;
export const CHALLENGE_DEFAULT_ZONE: [number, number] = [0.35, 0.65];
export const CHALLENGE_DEFAULT_DIFFICULTY = 0.3;

// ─── 물고기 생성 ─────────────────────────────────────────
export const FISH_WEIGHT_MIN_RATIO = 0.5;  // 최소 크기일 때 baseWeight 대비 비율
export const FISH_WEIGHT_SCALE = 1.5;      // 크기에 따른 무게 스케일링

// ─── 캔버스 ──────────────────────────────────────────────
export const CANVAS_RESIZE_DEBOUNCE = 100; // 리사이즈 디바운스 (ms)

// ─── 충돌 / 낚시 포인트 ─────────────────────────────────
export const FISHING_POINT_DETECT_OFFSET = 20; // 포인트 감지 추가 반경 (px)

// ─── 렌더링 애니메이션 속도 ──────────────────────────────
export const ANIM_CLOUD_SPEED = 8;
export const ANIM_WATER_SPARKLE_SPEED = 2;
export const ANIM_WATER_SPARKLE_Y_SPEED = 1.5;
export const ANIM_GRASS_SWAY_SPEED = 1.2;
export const ANIM_FISHING_POINT_PULSE_SPEED = 3;
export const ANIM_WALK_BOB_SPEED = 8;
export const ANIM_BITE_ROD_WOBBLE_SPEED = 15;
export const ANIM_BITE_LINE_WOBBLE_SPEED = 12;
export const ANIM_BITE_BOBBER_SPEED = 10;

// ─── 등급별 색상 ─────────────────────────────────────────
export const GRADE_COLORS: Record<FishGrade, string> = {
  common: '#9ca3af',
  uncommon: '#4ade80',
  rare: '#60a5fa',
  epic: '#c084fc',
  legendary: '#fbbf24',
};

// ─── 등급별 한국어 이름 ──────────────────────────────────
export const GRADE_NAMES: Record<FishGrade, string> = {
  common: '일반',
  uncommon: '고급',
  rare: '희귀',
  epic: '영웅',
  legendary: '전설',
};
